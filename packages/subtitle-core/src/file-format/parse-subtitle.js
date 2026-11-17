import {sortBy} from 'es-toolkit';
import {decodeHTML} from 'entities';
import {SubtitleFileFormat} from '../constants/subtitle-core-enums.js';
import {normalizeCueText, removeAssOverrides} from './normalize-cue-text.js';

export const MICRODVD_OPEN_CUE_DURATION_MS = 3000;

const MICRODVD_DEFAULT_FRAME_RATE = 23.976;
const MICRODVD_HEADER_FRAMES = new Set([0, 1]);
const ASS_EVENTS_SECTION_NAME = 'events';
const ASS_TEXT_FIELD_NAME = 'text';
const ASS_DEFAULT_EVENT_FIELD_NAMES = [
  'layer',
  'start',
  'end',
  'style',
  'name',
  'marginl',
  'marginr',
  'marginv',
  'effect',
  ASS_TEXT_FIELD_NAME,
];

const LINE_BREAK_PATTERN = /\r\n?/g;
const CUE_TIME_SOURCE = String.raw`((?:\d+:)?\d{1,2}:\d{1,2}[,.]\d{1,3})`;
const CUE_TIMING_PATTERN = new RegExp(
  String.raw`^[ \t]*${CUE_TIME_SOURCE}[ \t]*-->[ \t]*${CUE_TIME_SOURCE}`,
);
const CUE_INDEX_PATTERN = /^[ \t]*\d+[ \t]*$/;
const VTT_HEADER_PATTERN = /^WEBVTT/;
const VTT_STYLE_TAG_PATTERN = /<(?!\/?[ibu]>)[^<>]+>/g;
const ASS_SCRIPT_PATTERN = /^[ \t]*\[(script info|events)\]/i;
const ASS_VERSION_PATTERN =
  /^[ \t]*(\[v4\+ styles\]|scripttype:[ \t]*v4\.00\+)/i;
const SSA_VERSION_PATTERN =
  /^[ \t]*(\[v4 styles\]|scripttype:[ \t]*v4\.00[ \t]*$)/i;
const ASS_SECTION_PATTERN = /^[ \t]*\[([^\]]*)\]/;
const ASS_EVENT_LINE_PATTERN = /^[ \t]*(format|dialogue)[ \t]*:[ \t]?(.*)$/i;
const ASS_TIME_PATTERN =
  /^[ \t]*(\d+):(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?[ \t]*$/;
const ASS_HARD_LINE_BREAK_PATTERN = /\\N/g;
const ASS_SOFT_SPACE_PATTERN = /\\[nh]/g;
const SSA_FILE_NAME_PATTERN = /\.ssa$/i;
const MICRODVD_LINE_PATTERN = /^[ \t]*\{(\d+)\}\{(\d*)\}(.*)$/;
const MICRODVD_CONTROL_CODE_PATTERN = /\{[^{}]*\}/g;
const MICRODVD_LINE_BREAK = '|';
const MICRODVD_ITALIC_PATTERN = /^[ \t]*\//;
const FRAME_RATE_PATTERN = /^[ \t]*\d+(\.\d+)?[ \t]*$/;

const dropBlankCueLines = cueText =>
  cueText
    .split('\n')
    .filter(cueLine => cueLine.trim() !== '')
    .join('\n');

const toTimeMs = ({hours, minutes, seconds, fraction}) =>
  ((hours * 60 + minutes) * 60 + seconds) * 1000 +
  Number(fraction.padEnd(3, '0'));

const toCueTimeMs = cueTime => {
  const timeParts = cueTime.split(/[:,.]/);
  const fraction = timeParts.pop();
  const [seconds, minutes, hours = 0] = timeParts.map(Number).reverse();
  return toTimeMs({hours, minutes, seconds, fraction});
};

const readTimedTextCues = (lines, toCueText) => {
  const cueDrafts = [];
  let cueDraft = null;
  lines.forEach((line, lineIndex) => {
    const timingMatch = CUE_TIMING_PATTERN.exec(line);
    if (timingMatch) {
      cueDraft = {
        startMs: toCueTimeMs(timingMatch[1]),
        endMs: toCueTimeMs(timingMatch[2]),
        lines: [],
      };
      cueDrafts.push(cueDraft);
      return;
    }
    if (line.trim() === '') {
      cueDraft = null;
      return;
    }
    const isNextCueIndex =
      CUE_INDEX_PATTERN.test(line) &&
      CUE_TIMING_PATTERN.test(lines[lineIndex + 1] ?? '');
    if (cueDraft && !isNextCueIndex) {
      cueDraft.lines.push(line.trimEnd());
    }
  });
  return cueDrafts.map(({startMs, endMs, lines: cueLines}) => ({
    startMs,
    endMs,
    text: toCueText(cueLines.join('\n')),
  }));
};

const toVttCueText = cueText =>
  decodeHTML(cueText.replace(VTT_STYLE_TAG_PATTERN, ''));

const toAssCueText = assText =>
  removeAssOverrides(assText)
    .replace(ASS_HARD_LINE_BREAK_PATTERN, '\n')
    .replace(ASS_SOFT_SPACE_PATTERN, ' ')
    .trim();

const toAssTimeMs = assTime => {
  const timeMatch = ASS_TIME_PATTERN.exec(assTime ?? '');
  if (!timeMatch) {
    return null;
  }
  const [, hours, minutes, seconds, fraction = ''] = timeMatch;
  return toTimeMs({
    hours: Number(hours),
    minutes: Number(minutes),
    seconds: Number(seconds),
    fraction: fraction.padEnd(2, '0'),
  });
};

const toAssCue = (eventValue, eventFieldNames) => {
  const textFieldIndex = eventFieldNames.length - 1;
  const fieldValues = eventValue.split(',');
  if (
    eventFieldNames[textFieldIndex] !== ASS_TEXT_FIELD_NAME ||
    fieldValues.length < eventFieldNames.length
  ) {
    return null;
  }
  const readField = fieldName =>
    fieldValues[eventFieldNames.indexOf(fieldName)];
  const startMs = toAssTimeMs(readField('start'));
  const endMs = toAssTimeMs(readField('end'));
  if (startMs === null || endMs === null) {
    return null;
  }
  return {
    startMs,
    endMs,
    text: toAssCueText(fieldValues.slice(textFieldIndex).join(',')),
  };
};

const readAssCues = lines => {
  const cues = [];
  let isEventsSection = false;
  let eventFieldNames = ASS_DEFAULT_EVENT_FIELD_NAMES;
  lines.forEach(line => {
    const sectionMatch = ASS_SECTION_PATTERN.exec(line);
    if (sectionMatch) {
      isEventsSection =
        sectionMatch[1].trim().toLowerCase() === ASS_EVENTS_SECTION_NAME;
      return;
    }
    const eventMatch = isEventsSection && ASS_EVENT_LINE_PATTERN.exec(line);
    if (!eventMatch) {
      return;
    }
    const [, eventLineKind, eventValue] = eventMatch;
    if (eventLineKind.toLowerCase() === 'format') {
      eventFieldNames = eventValue
        .split(',')
        .map(fieldName => fieldName.trim().toLowerCase());
      return;
    }
    const cue = toAssCue(eventValue, eventFieldNames);
    if (cue) {
      cues.push(cue);
    }
  });
  return cues;
};

const toMicroDvdCueText = cueText =>
  cueText
    .replace(MICRODVD_CONTROL_CODE_PATTERN, '')
    .split(MICRODVD_LINE_BREAK)
    .map(cueLine => cueLine.replace(MICRODVD_ITALIC_PATTERN, '').trim())
    .join('\n');

const readHeaderFrameRate = firstCueFrame => {
  const isHeader =
    firstCueFrame &&
    MICRODVD_HEADER_FRAMES.has(firstCueFrame.startFrame) &&
    firstCueFrame.startFrame === firstCueFrame.endFrame &&
    FRAME_RATE_PATTERN.test(firstCueFrame.cueText);
  return isHeader ? Number(firstCueFrame.cueText) : null;
};

const readMicroDvd = (lines, fallbackFrameRate) => {
  const cueFrames = lines
    .map(line => MICRODVD_LINE_PATTERN.exec(line))
    .filter(Boolean)
    .map(([, startFrame, endFrame, cueText]) => ({
      startFrame: Number(startFrame),
      endFrame: endFrame === '' ? null : Number(endFrame),
      cueText,
    }));
  const headerFrameRate = readHeaderFrameRate(cueFrames[0]);
  const frameRate = headerFrameRate > 0 ? headerFrameRate : null;
  const timingFrameRate =
    frameRate || fallbackFrameRate || MICRODVD_DEFAULT_FRAME_RATE;
  const toFrameMs = frame => Math.round((frame * 1000) / timingFrameRate);
  return {
    frameRate,
    cues: cueFrames
      .slice(headerFrameRate === null ? 0 : 1)
      .map(({startFrame, endFrame, cueText}) => ({
        startMs: toFrameMs(startFrame),
        endMs:
          endFrame === null
            ? toFrameMs(startFrame) + MICRODVD_OPEN_CUE_DURATION_MS
            : toFrameMs(endFrame),
        text: toMicroDvdCueText(cueText),
      })),
  };
};

const hasLine = (lines, linePattern) =>
  lines.some(line => linePattern.test(line));

const detectSubtitleFileFormat = (lines, fileNameHint) => {
  if (VTT_HEADER_PATTERN.test(lines[0])) {
    return SubtitleFileFormat.VTT;
  }
  if (hasLine(lines, ASS_SCRIPT_PATTERN)) {
    if (hasLine(lines, ASS_VERSION_PATTERN)) {
      return SubtitleFileFormat.ASS;
    }
    if (
      hasLine(lines, SSA_VERSION_PATTERN) ||
      SSA_FILE_NAME_PATTERN.test(fileNameHint ?? '')
    ) {
      return SubtitleFileFormat.SSA;
    }
    return SubtitleFileFormat.ASS;
  }
  if (hasLine(lines, MICRODVD_LINE_PATTERN)) {
    return SubtitleFileFormat.MICRODVD;
  }
  if (hasLine(lines, CUE_TIMING_PATTERN)) {
    return SubtitleFileFormat.SRT;
  }
  return SubtitleFileFormat.OTHER;
};

const readCues = ({subtitleFileFormat, lines, fallbackFrameRate}) => {
  switch (subtitleFileFormat) {
    case SubtitleFileFormat.SRT:
      return {
        cues: readTimedTextCues(lines, cueText => cueText),
        frameRate: null,
      };
    case SubtitleFileFormat.VTT:
      return {cues: readTimedTextCues(lines, toVttCueText), frameRate: null};
    case SubtitleFileFormat.ASS:
    case SubtitleFileFormat.SSA:
      return {cues: readAssCues(lines), frameRate: null};
    case SubtitleFileFormat.MICRODVD:
      return readMicroDvd(lines, fallbackFrameRate);
    default:
      return {cues: [], frameRate: null};
  }
};

export const parseSubtitleText = ({text, fileNameHint, fallbackFrameRate}) => {
  const lines = text.trimStart().replace(LINE_BREAK_PATTERN, '\n').split('\n');
  const subtitleFileFormat = detectSubtitleFileFormat(lines, fileNameHint);
  const {cues, frameRate} = readCues({
    subtitleFileFormat,
    lines,
    fallbackFrameRate,
  });
  return {
    subtitleFileFormat,
    cues: sortBy(
      cues
        .map(cue => ({...cue, text: dropBlankCueLines(cue.text)}))
        .filter(
          cue => cue.endMs > cue.startMs && normalizeCueText(cue.text) !== '',
        ),
      ['startMs', 'endMs'],
    ),
    frameRate,
    sourceText: text,
  };
};
