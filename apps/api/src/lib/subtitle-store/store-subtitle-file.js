import {promisify} from 'node:util';
import {zstdCompress} from 'node:zlib';
import {SubtitleFileInvalidReason} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {buildFileFacts} from '@repo/subtitle-core/file-format/file-facts.js';
import {SubtitleFile} from '../../db/models/subtitle-file.js';

const compressFileBytes = promisify(zstdCompress);

const UNSERVABLE_INVALID_REASONS = new Set([
  SubtitleFileInvalidReason.ERROR_PAGE,
  SubtitleFileInvalidReason.UNREADABLE,
]);

export function isServableSubtitleFile({cueCount, fileInvalidReasons}) {
  return (
    cueCount > 0 &&
    !fileInvalidReasons.some(invalidReason =>
      UNSERVABLE_INVALID_REASONS.has(invalidReason),
    )
  );
}

export async function buildSubtitleFileRow({
  subtitleId,
  fileBytes,
  fileNameHint,
  fileOrigin,
  expectedLanguageCode,
  fallbackFrameRate,
}) {
  const {parsedSubtitle, fileFacts, fileEncoding} = buildFileFacts({
    bytes: fileBytes,
    fileNameHint,
    expectedLanguageCode,
    fallbackFrameRate,
  });
  return {
    parsedSubtitle,
    fileFacts,
    subtitleFileRow: {
      subtitleId,
      fileContent: await compressFileBytes(fileBytes),
      fileFormat: parsedSubtitle.subtitleFileFormat,
      fileEncoding,
      fileSizeBytes: fileBytes.length,
      contentKey: fileFacts.contentKey,
      fileFetchedAt: new Date(),
      fileOrigin,
      detectedLanguageCode: fileFacts.detectedLanguageCode,
      cueCount: fileFacts.cueCount,
      lastCueEndMs: fileFacts.lastCueEndMs,
      fileFps: parsedSubtitle.frameRate,
      isFileValid: fileFacts.isFileValid,
      fileInvalidReasons: fileFacts.fileInvalidReasons,
    },
  };
}

export async function insertSubtitleFileRows(subtitleFileRows, transaction) {
  await SubtitleFile.bulkCreate(subtitleFileRows, {
    ignoreDuplicates: true,
    returning: false,
    validate: true,
    transaction,
  });
}

export function isErrorPageFile({fileInvalidReasons}) {
  return fileInvalidReasons.includes(SubtitleFileInvalidReason.ERROR_PAGE);
}

export async function storeSubtitleFile(storeOptions) {
  const {parsedSubtitle, fileFacts, subtitleFileRow} =
    await buildSubtitleFileRow(storeOptions);
  if (!isErrorPageFile(fileFacts)) {
    await insertSubtitleFileRows([subtitleFileRow]);
  }
  return {parsedSubtitle, fileFacts};
}
