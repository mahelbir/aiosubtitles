import {countBy, maxBy} from 'es-toolkit';
import {
  SubtitleFileFormat,
  SubtitleFileInvalidReason,
} from '../constants/subtitle-core-enums.js';
import {
  canDetectLanguageCode,
  detectLanguageCode,
  isLatinScriptText,
  isSameBaseLanguage,
} from './detect-language.js';
import {normalizeCueText} from './normalize-cue-text.js';

export const SUBTITLE_CUE_COUNT_MIN = 10;
export const REPETITIVE_TEXT_SHARE_MAX = 0.2;

const ERROR_PAGE_PATTERN = /^\s*<(!doctype\s+html|html[\s>])/i;

const toAssessment = ({fileInvalidReasons, detectedLanguageCode}) => ({
  isFileValid: fileInvalidReasons.length === 0,
  fileInvalidReasons,
  detectedLanguageCode,
});

const isRepetitive = cueTexts => {
  const mostRepeatedCount = maxBy(
    Object.values(countBy(cueTexts, cueText => cueText)),
    textCount => textCount,
  );
  return (
    mostRepeatedCount > 1 &&
    mostRepeatedCount / cueTexts.length > REPETITIVE_TEXT_SHARE_MAX
  );
};

const isWrongLanguage = ({
  detectedLanguageCode,
  expectedLanguageCode,
  cueText,
}) =>
  Boolean(detectedLanguageCode && expectedLanguageCode) &&
  canDetectLanguageCode(expectedLanguageCode) &&
  !isSameBaseLanguage(detectedLanguageCode, expectedLanguageCode, {
    canMergeSiblings: isLatinScriptText(cueText),
  });

export const assessSubtitleFile = ({parsedSubtitle, expectedLanguageCode}) => {
  if (ERROR_PAGE_PATTERN.test(parsedSubtitle.sourceText)) {
    return toAssessment({
      fileInvalidReasons: [SubtitleFileInvalidReason.ERROR_PAGE],
      detectedLanguageCode: null,
    });
  }
  const cueTexts = parsedSubtitle.cues
    .map(cue => normalizeCueText(cue.text))
    .filter(cueText => cueText !== '');
  if (
    parsedSubtitle.subtitleFileFormat === SubtitleFileFormat.OTHER ||
    cueTexts.length === 0
  ) {
    return toAssessment({
      fileInvalidReasons: [SubtitleFileInvalidReason.UNREADABLE],
      detectedLanguageCode: null,
    });
  }
  const cueText = cueTexts.join('\n');
  const detectedLanguageCode = detectLanguageCode(cueText);
  return toAssessment({
    fileInvalidReasons: [
      cueTexts.length < SUBTITLE_CUE_COUNT_MIN &&
        SubtitleFileInvalidReason.TOO_SHORT,
      isRepetitive(cueTexts) && SubtitleFileInvalidReason.REPETITIVE,
      isWrongLanguage({
        detectedLanguageCode,
        expectedLanguageCode,
        cueText,
      }) && SubtitleFileInvalidReason.WRONG_LANGUAGE,
    ].filter(Boolean),
    detectedLanguageCode,
  });
};
