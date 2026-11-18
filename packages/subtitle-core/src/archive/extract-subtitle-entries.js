import {once, sumBy} from 'es-toolkit';
import {Unzip, UnzipInflate} from 'fflate';
import {libarchiveWasm} from 'libarchive-wasm';
import {ArchiveKind} from '../constants/subtitle-core-enums.js';
import {
  detectArchiveKind,
  hasUnknownRarSignature,
} from './detect-archive-kind.js';

export const ARCHIVE_INFLATED_BYTES_MAX = 52428800;

export const ARCHIVE_ENTRY_COUNT_MAX = 500;

const ARCHIVE_SUBTITLE_EXTENSIONS = new Set([
  'srt',
  'ass',
  'ssa',
  'vtt',
  'sub',
]);
const MACOS_METADATA_FOLDER = '__MACOSX';
const ZIP_PUSH_SLICE_BYTES = 1024;
const LIBARCHIVE_READ_CHUNK_BYTES = 65536;
const ZIP_END_RECORD_SIGNATURE = 0x06054b50;
const ZIP_END_RECORD_BYTE_LENGTH = 22;
const ZIP_END_TOTAL_ENTRY_COUNT_OFFSET = 10;
const ZIP_END_COMMENT_LENGTH_OFFSET = 20;
const ZIP_COMMENT_BYTES_MAX = 65535;

export class ArchiveError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ArchiveLimitError extends ArchiveError {}

export class ArchiveReadError extends ArchiveError {}

const normalizeEntryPath = entryPath => entryPath.replaceAll('\\', '/');

const isSubtitleEntryPath = entryPath => {
  const pathParts = entryPath.split('/');
  const fileName = pathParts.at(-1);
  const extensionStart = fileName.lastIndexOf('.');
  return (
    !pathParts.includes(MACOS_METADATA_FOLDER) &&
    !fileName.startsWith('.') &&
    extensionStart > 0 &&
    ARCHIVE_SUBTITLE_EXTENSIONS.has(
      fileName.slice(extensionStart + 1).toLowerCase(),
    )
  );
};

const createLimitTracker = ({inflatedBytesMax, entryCountMax}) => {
  let entryCount = 0;
  let inflatedByteCount = 0;
  const throwPastByteLimit = () => {
    throw new ArchiveLimitError('The archive inflates past the size limit.');
  };
  return {
    get entryCount() {
      return entryCount;
    },
    countEntry: () => {
      entryCount += 1;
      if (entryCount > entryCountMax) {
        throw new ArchiveLimitError('The archive holds too many entries.');
      }
    },
    checkDeclaredBytes: declaredByteLength => {
      const isWithinLimit =
        declaredByteLength >= 0 &&
        inflatedByteCount + declaredByteLength <= inflatedBytesMax;
      if (!isWithinLimit) {
        throwPastByteLimit();
      }
    },
    countBytes: byteLength => {
      inflatedByteCount += byteLength;
      if (inflatedByteCount > inflatedBytesMax) {
        throwPastByteLimit();
      }
    },
  };
};

const joinChunks = chunks => {
  const joinedBytes = new Uint8Array(sumBy(chunks, chunk => chunk.length));
  let byteOffset = 0;
  for (const chunk of chunks) {
    joinedBytes.set(chunk, byteOffset);
    byteOffset += chunk.length;
  }
  return joinedBytes;
};

const readZipEndRecordEntryCount = bytes => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const searchStart = bytes.length - ZIP_END_RECORD_BYTE_LENGTH;
  const searchEnd = Math.max(0, searchStart - ZIP_COMMENT_BYTES_MAX);
  for (
    let recordOffset = searchStart;
    recordOffset >= searchEnd;
    recordOffset--
  ) {
    const recordEnd =
      recordOffset +
      ZIP_END_RECORD_BYTE_LENGTH +
      view.getUint16(recordOffset + ZIP_END_COMMENT_LENGTH_OFFSET, true);
    if (
      view.getUint32(recordOffset, true) === ZIP_END_RECORD_SIGNATURE &&
      recordEnd <= bytes.length
    ) {
      return view.getUint16(
        recordOffset + ZIP_END_TOTAL_ENTRY_COUNT_OFFSET,
        true,
      );
    }
  }
  return null;
};

const extractZipEntries = (bytes, limitTracker) => {
  const subtitleEntries = [];
  const unzip = new Unzip(zipFile => {
    limitTracker.countEntry();
    const entryPath = normalizeEntryPath(zipFile.name);
    const isSubtitle = isSubtitleEntryPath(entryPath);
    const chunks = [];
    zipFile.ondata = (inflateError, chunk, isFinal) => {
      if (inflateError) {
        throw inflateError;
      }
      limitTracker.countBytes(chunk.length);
      if (isSubtitle) {
        chunks.push(chunk);
      }
      if (isSubtitle && isFinal) {
        subtitleEntries.push({entryPath, entryBytes: joinChunks(chunks)});
      }
    };
    zipFile.start();
  });
  unzip.register(UnzipInflate);
  for (
    let sliceStart = 0;
    sliceStart < bytes.length;
    sliceStart += ZIP_PUSH_SLICE_BYTES
  ) {
    const sliceEnd = sliceStart + ZIP_PUSH_SLICE_BYTES;
    unzip.push(bytes.subarray(sliceStart, sliceEnd), sliceEnd >= bytes.length);
  }
  if (readZipEndRecordEntryCount(bytes) !== limitTracker.entryCount) {
    throw new ArchiveReadError('The ZIP archive is incomplete.');
  }
  return subtitleEntries;
};

const loadLibarchive = once(() => libarchiveWasm());

const allocateWasmBytes = (wasmModule, byteLength) => {
  const wasmPointer = wasmModule._malloc(byteLength);
  if (wasmPointer === 0) {
    throw new ArchiveReadError('The archive reader ran out of memory.');
  }
  return wasmPointer;
};

const readLibarchiveEntry = (
  {libarchive, archivePointer, chunkPointer},
  limitTracker,
) => {
  const chunks = [];
  for (;;) {
    const chunkByteLength = libarchive.read_data(
      archivePointer,
      chunkPointer,
      LIBARCHIVE_READ_CHUNK_BYTES,
    );
    if (chunkByteLength === 0) {
      return chunks;
    }
    limitTracker.countBytes(chunkByteLength);
    chunks.push(
      libarchive.module.HEAPU8.slice(
        chunkPointer,
        chunkPointer + chunkByteLength,
      ),
    );
  }
};

const readLibarchiveEntries = (openArchive, limitTracker) => {
  const {libarchive, archivePointer} = openArchive;
  const subtitleEntries = [];
  for (
    let entryPointer = libarchive.read_next_entry(archivePointer);
    entryPointer !== 0;
    entryPointer = libarchive.read_next_entry(archivePointer)
  ) {
    limitTracker.countEntry();
    limitTracker.checkDeclaredBytes(libarchive.entry_size(entryPointer));
    const entryPath = normalizeEntryPath(
      libarchive.entry_pathname(entryPointer),
    );
    const chunks = readLibarchiveEntry(openArchive, limitTracker);
    if (isSubtitleEntryPath(entryPath)) {
      subtitleEntries.push({entryPath, entryBytes: joinChunks(chunks)});
    }
  }
  const archiveErrorText = libarchive.error_string(archivePointer);
  if (archiveErrorText) {
    throw new Error(archiveErrorText);
  }
  return subtitleEntries;
};

const extractLibarchiveEntries = async (bytes, limitTracker) => {
  const libarchive = await loadLibarchive();
  const wasmModule = libarchive.module;
  const wasmPointers = [];
  let archivePointer = 0;
  try {
    const inputPointer = allocateWasmBytes(wasmModule, bytes.length);
    wasmPointers.push(inputPointer);
    wasmModule.HEAPU8.set(bytes, inputPointer);
    const chunkPointer = allocateWasmBytes(
      wasmModule,
      LIBARCHIVE_READ_CHUNK_BYTES,
    );
    wasmPointers.push(chunkPointer);
    archivePointer = wasmModule._archive_read_new_memory(
      inputPointer,
      bytes.length,
      0,
    );
    if (archivePointer === 0) {
      throw new ArchiveReadError('The archive could not be opened.');
    }
    return readLibarchiveEntries(
      {libarchive, archivePointer, chunkPointer},
      limitTracker,
    );
  } finally {
    try {
      if (archivePointer !== 0) {
        libarchive.read_free(archivePointer);
      }
    } finally {
      for (const wasmPointer of wasmPointers) {
        wasmModule._free(wasmPointer);
      }
    }
  }
};

const ENTRY_EXTRACTORS = Object.freeze({
  [ArchiveKind.ZIP]: extractZipEntries,
  [ArchiveKind.RAR]: extractLibarchiveEntries,
  [ArchiveKind.SEVEN_ZIP]: extractLibarchiveEntries,
});

export const extractSubtitleEntries = async (
  bytes,
  {
    inflatedBytesMax = ARCHIVE_INFLATED_BYTES_MAX,
    entryCountMax = ARCHIVE_ENTRY_COUNT_MAX,
  } = {},
) => {
  if (hasUnknownRarSignature(bytes)) {
    throw new ArchiveReadError('The RAR variant is not supported.');
  }
  const extractEntries = ENTRY_EXTRACTORS[detectArchiveKind(bytes)];
  if (extractEntries == null) {
    return [];
  }
  const limitTracker = createLimitTracker({inflatedBytesMax, entryCountMax});
  let subtitleEntries;
  try {
    subtitleEntries = await extractEntries(bytes, limitTracker);
  } catch (extractError) {
    if (extractError instanceof ArchiveError) {
      throw extractError;
    }
    throw new ArchiveReadError('The archive could not be read.', {
      cause: extractError,
    });
  }
  if (limitTracker.entryCount === 0) {
    throw new ArchiveReadError('The archive holds no entries.');
  }
  return subtitleEntries;
};
