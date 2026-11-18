import {zstdDecompressSync} from 'node:zlib';
import {SubtitleFileFormat} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {decodeSubtitleBytesAs} from '@repo/subtitle-core/file-format/decode-text.js';
import {buildFileFacts} from '@repo/subtitle-core/file-format/file-facts.js';
import {parseSubtitleText} from '@repo/subtitle-core/file-format/parse-subtitle.js';
import {Subtitle} from '../../db/models/subtitle.js';

export async function readSubtitleFile(subtitleId) {
  const subtitle =
    await Subtitle.withScope('withStoredFile').findByPk(subtitleId);
  if (!subtitle?.subtitleFile) {
    return null;
  }
  const {parsedSubtitle, fileFacts} = buildFileFacts({
    bytes: zstdDecompressSync(subtitle.subtitleFile.fileContent),
    fileNameHint: toFileNameHint(subtitle.subtitleFile),
    expectedLanguageCode: subtitle.siteLanguageCode,
    fallbackFrameRate: subtitle.siteFps,
  });
  return {parsedSubtitle, fileFacts};
}

export function parseStoredSubtitleFile({subtitleFile, siteFps}) {
  return parseSubtitleText({
    text: decodeSubtitleBytesAs(
      zstdDecompressSync(subtitleFile.fileContent),
      subtitleFile.fileEncoding,
    ),
    fileNameHint: toFileNameHint(subtitleFile),
    fallbackFrameRate: siteFps,
  });
}

function toFileNameHint({fileFormat}) {
  const [fileExtension] = SubtitleFileFormat.item(fileFormat).fileExtensions;
  return fileExtension ? `subtitle.${fileExtension}` : null;
}
