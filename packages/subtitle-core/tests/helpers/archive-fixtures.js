import {readFileSync} from 'node:fs';
import {strToU8, Zip, ZipDeflate, zipSync} from 'fflate';
import {buildStoredRar} from './build-stored-rar.js';
import {buildSrtText} from './file-format-fixtures.js';

const FIXTURE_DIR = new URL('../fixtures/archive/', import.meta.url);

export const readArchiveFixture = fixtureName =>
  new Uint8Array(readFileSync(new URL(fixtureName, FIXTURE_DIR)));

export const sevenZipEpisodesFixture = () => readArchiveFixture('episodes.7z');

export const episodeSrtBytes = episodeWord =>
  strToU8(buildSrtText([`Episode ${episodeWord}.`]));

export const fillerBytes = byteLength => new Uint8Array(byteLength).fill(0x61);

export const buildZip = archiveEntries =>
  zipSync(
    Object.fromEntries(
      archiveEntries.map(({entryPath, entryBytes}) => [entryPath, entryBytes]),
    ),
  );

export const buildStreamedZip = archiveEntries => {
  const zipChunks = [];
  const zip = new Zip((zipError, zipChunk) => {
    if (zipError) {
      throw zipError;
    }
    zipChunks.push(zipChunk);
  });
  for (const {entryPath, entryBytes} of archiveEntries) {
    const zipEntry = new ZipDeflate(entryPath);
    zip.add(zipEntry);
    zipEntry.push(entryBytes, true);
  }
  zip.end();
  const zipBytes = new Uint8Array(
    zipChunks.reduce((byteLength, zipChunk) => byteLength + zipChunk.length, 0),
  );
  zipChunks.reduce((byteOffset, zipChunk) => {
    zipBytes.set(zipChunk, byteOffset);
    return byteOffset + zipChunk.length;
  }, 0);
  return zipBytes;
};

export const archiveBuilders = [
  ['ZIP', buildZip],
  ['streamed ZIP', buildStreamedZip],
  ['RAR', buildStoredRar],
];

export const episodePackEntries = () => [
  {entryPath: 'S01E01.srt', entryBytes: episodeSrtBytes('one')},
  {entryPath: 'S01E02.srt', entryBytes: episodeSrtBytes('two')},
  {entryPath: 'S01E02.SDH.srt', entryBytes: episodeSrtBytes('two SDH')},
  {entryPath: 'readme.txt', entryBytes: strToU8('Enjoy.')},
  {entryPath: '__MACOSX/._S01E01.srt', entryBytes: episodeSrtBytes('ghost')},
];

const ZIP_LOCAL_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_INFLATED_SIZE_OFFSET = 22;
const ZIP_CENTRAL_INFLATED_SIZE_OFFSET = 24;

const ZIP_LOCAL_HEADER_BYTE_LENGTH = 30;
const ZIP_NAME_LENGTH_OFFSET = 26;
const ZIP_EXTRA_LENGTH_OFFSET = 28;
const DEFLATE_RESERVED_FINAL_BLOCK = 0x07;

const ZIP_END_RECORD_SIGNATURE = 0x06054b50;
const ZIP_END_DISK_ENTRY_COUNT_OFFSET = 8;
const ZIP_END_TOTAL_ENTRY_COUNT_OFFSET = 10;
const UNKNOWN_RAR_VARIANT_SIGNATURE = [
  0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x05,
];
const UNKNOWN_RAR_VARIANT_PADDING_BYTE = 0x41;

export const unknownRarVariantBytes = (byteLength = 1024) => {
  const variantBytes = new Uint8Array(byteLength).fill(
    UNKNOWN_RAR_VARIANT_PADDING_BYTE,
  );
  variantBytes.set(UNKNOWN_RAR_VARIANT_SIGNATURE);
  return variantBytes;
};

const listSignatureOffsets = (archiveBytes, signature) => {
  const view = new DataView(
    archiveBytes.buffer,
    archiveBytes.byteOffset,
    archiveBytes.byteLength,
  );
  const signatureOffsets = [];
  for (let byteIndex = 0; byteIndex + 4 <= archiveBytes.length; byteIndex++) {
    if (view.getUint32(byteIndex, true) === signature) {
      signatureOffsets.push(byteIndex);
    }
  }
  return signatureOffsets;
};

export const cutZipInsideEntry = (zipBytes, entryIndex, entryByteOffset) =>
  zipBytes.slice(
    0,
    listSignatureOffsets(zipBytes, ZIP_LOCAL_HEADER_SIGNATURE)[entryIndex] +
      entryByteOffset,
  );

export const declareZipEntryCount = (zipBytes, declaredEntryCount) => {
  const patchedBytes = zipBytes.slice();
  const view = new DataView(patchedBytes.buffer);
  const endRecordOffset = listSignatureOffsets(
    patchedBytes,
    ZIP_END_RECORD_SIGNATURE,
  ).at(-1);
  for (const countOffset of [
    ZIP_END_DISK_ENTRY_COUNT_OFFSET,
    ZIP_END_TOTAL_ENTRY_COUNT_OFFSET,
  ]) {
    view.setUint16(endRecordOffset + countOffset, declaredEntryCount, true);
  }
  return patchedBytes;
};

export const flipByte = (archiveBytes, byteIndex) => {
  const flippedBytes = archiveBytes.slice();
  flippedBytes[byteIndex] ^= 0xff;
  return flippedBytes;
};

export const breakFirstZipDeflateBlock = zipBytes => {
  const brokenBytes = zipBytes.slice();
  const view = new DataView(brokenBytes.buffer);
  const dataStart =
    ZIP_LOCAL_HEADER_BYTE_LENGTH +
    view.getUint16(ZIP_NAME_LENGTH_OFFSET, true) +
    view.getUint16(ZIP_EXTRA_LENGTH_OFFSET, true);
  brokenBytes[dataStart] = DEFLATE_RESERVED_FINAL_BLOCK;
  return brokenBytes;
};

export const declareZipInflatedSize = (zipBytes, declaredSize) => {
  const patchedBytes = zipBytes.slice();
  const view = new DataView(patchedBytes.buffer);
  for (let byteIndex = 0; byteIndex + 4 <= patchedBytes.length; byteIndex++) {
    const signature = view.getUint32(byteIndex, true);
    if (signature === ZIP_LOCAL_HEADER_SIGNATURE) {
      view.setUint32(
        byteIndex + ZIP_LOCAL_INFLATED_SIZE_OFFSET,
        declaredSize,
        true,
      );
    }
    if (signature === ZIP_CENTRAL_HEADER_SIGNATURE) {
      view.setUint32(
        byteIndex + ZIP_CENTRAL_INFLATED_SIZE_OFFSET,
        declaredSize,
        true,
      );
    }
  }
  return patchedBytes;
};
