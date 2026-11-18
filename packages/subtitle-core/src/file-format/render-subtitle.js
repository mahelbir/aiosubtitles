import {
  ASS_FILE_FORMATS,
  SubtitleFileExtension,
} from '../constants/subtitle-core-enums.js';

const ASS_DOCUMENT_HEADER = [
  '[Script Info]',
  'ScriptType: v4.00+',
  'WrapStyle: 0',
  'ScaledBorderAndShadow: yes',
  'PlayResX: 1920',
  'PlayResY: 1080',
  '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  'Style: Default,Arial,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,1,2,60,60,50,1',
  '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
].join('\n');
const SRT_STYLE_TAG_PATTERN = /<(\/?)([ibus])>/gi;
const MARKUP_TAG_PATTERN = /<\/?[a-z][^<>]*>/gi;
const LINE_BREAK_PATTERN = /\n/g;

const toClockParts = (timeMs, unitMs) => {
  const totalUnits = Math.round(Math.max(timeMs, 0) / unitMs);
  const unitsPerSecond = 1000 / unitMs;
  const totalSeconds = Math.floor(totalUnits / unitsPerSecond);
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: String(Math.floor(totalSeconds / 60) % 60).padStart(2, '0'),
    seconds: String(totalSeconds % 60).padStart(2, '0'),
    fraction: totalUnits % unitsPerSecond,
  };
};

const formatSrtTime = timeMs => {
  const {hours, minutes, seconds, fraction} = toClockParts(timeMs, 1);
  return `${String(hours).padStart(2, '0')}:${minutes}:${seconds},${String(fraction).padStart(3, '0')}`;
};

const formatAssTime = timeMs => {
  const {hours, minutes, seconds, fraction} = toClockParts(timeMs, 10);
  return `${hours}:${minutes}:${seconds}.${String(fraction).padStart(2, '0')}`;
};

const toAssDialogueText = cueText =>
  cueText
    .replace(
      SRT_STYLE_TAG_PATTERN,
      (_, closingSlash, styleTag) =>
        `{\\${styleTag.toLowerCase()}${closingSlash ? 0 : 1}}`,
    )
    .replace(MARKUP_TAG_PATTERN, '')
    .replace(LINE_BREAK_PATTERN, '\\N');

const toWrittenCues = cues => cues.filter(({text}) => text.trim() !== '');

export const renderSrtText = cues =>
  toWrittenCues(cues)
    .map(
      ({startMs, endMs, text}, cueIndex) =>
        `${cueIndex + 1}\n${formatSrtTime(startMs)} --> ${formatSrtTime(endMs)}\n${text}\n`,
    )
    .join('\n');

const renderAssText = cues =>
  [
    ASS_DOCUMENT_HEADER,
    ...toWrittenCues(cues).map(
      ({startMs, endMs, text}) =>
        `Dialogue: 0,${formatAssTime(startMs)},${formatAssTime(endMs)},Default,,0,0,0,,${toAssDialogueText(text)}`,
    ),
    '',
  ].join('\n');

export const renderSubtitleFile = ({parsedSubtitle, fileExtension}) => {
  switch (fileExtension) {
    case SubtitleFileExtension.SRT:
      return renderSrtText(parsedSubtitle.cues);
    case SubtitleFileExtension.ASS:
      return ASS_FILE_FORMATS.has(parsedSubtitle.subtitleFileFormat)
        ? parsedSubtitle.sourceText
        : renderAssText(parsedSubtitle.cues);
    default:
      throw new Error(`Unsupported subtitle file extension: ${fileExtension}.`);
  }
};
