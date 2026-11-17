import {maxBy} from 'es-toolkit';
import {assessSubtitleFile} from './assess-subtitle.js';
import {computeContentKey} from './content-key.js';
import {decodeSubtitleBytes} from './decode-text.js';
import {normalizeCueText} from './normalize-cue-text.js';
import {parseSubtitleText} from './parse-subtitle.js';

export const buildFileFacts = ({
  bytes,
  fileNameHint,
  expectedLanguageCode,
  fallbackFrameRate,
}) => {
  const {text, encoding} = decodeSubtitleBytes(bytes, {
    languageCodeHint: expectedLanguageCode,
  });
  const parsedSubtitle = parseSubtitleText({
    text,
    fileNameHint,
    fallbackFrameRate,
  });
  const {cues} = parsedSubtitle;
  return {
    fileFacts: {
      contentKey: computeContentKey(cues),
      ...assessSubtitleFile({parsedSubtitle, expectedLanguageCode}),
      cueCount: cues.length,
      lastCueEndMs: maxBy(cues, cue => cue.endMs)?.endMs ?? 0,
      normalizedCues: cues.map(({startMs, endMs, text: cueText}) => ({
        startMs,
        endMs,
        text: normalizeCueText(cueText),
      })),
    },
    parsedSubtitle,
    fileEncoding: encoding,
  };
};
