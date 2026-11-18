import {ASS_FILE_FORMATS} from '../constants/subtitle-core-enums.js';
import {decodeSubtitleBytes, decodeSubtitleBytesAs} from './decode-text.js';
import {parseSubtitleText} from './parse-subtitle.js';

const ASS_SECTION_PATTERN = /^[ \t]*\[([^\]]*)\]/;
const ASS_EVENTS_SECTION_NAME = 'events';
const ASS_FORMAT_LINE_PATTERN = /^[ \t]*format[ \t]*:/i;
const ASS_DIALOGUE_LINE_PATTERN = /^[ \t]*dialogue[ \t]*:/i;
const ASS_PROBE_HEADER = '[Script Info]\nScriptType: v4.00+\n\n[Events]';
const ASS_DEFAULT_FORMAT_LINE =
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text';
const TIMED_TEXT_BLOCK_SEPARATOR_PATTERN = /(\r?\n[ \t]*\r?\n)/;
const LINE_SEPARATOR = '\n';
const UTF16_ENCODING_PREFIX = 'utf-16';
const BYTE_TEXT_CHUNK_SIZE = 8192;

const toByteText = bytes => {
  let byteText = '';
  for (
    let chunkStart = 0;
    chunkStart < bytes.length;
    chunkStart += BYTE_TEXT_CHUNK_SIZE
  ) {
    byteText += String.fromCharCode(
      ...bytes.subarray(chunkStart, chunkStart + BYTE_TEXT_CHUNK_SIZE),
    );
  }
  return byteText;
};

const fromByteText = byteText =>
  Uint8Array.from(byteText, character => character.charCodeAt(0));

const hasOnlyDroppedCues = (segmentText, isCueDropped) => {
  const {cues} = parseSubtitleText({text: segmentText, fileNameHint: null});
  return cues.length > 0 && cues.every(isCueDropped);
};

const dropAssLines = (text, isDroppedSegment) => {
  let isEventsSection = false;
  let formatLine = ASS_DEFAULT_FORMAT_LINE;
  return text
    .split(LINE_SEPARATOR)
    .filter(line => {
      const sectionMatch = ASS_SECTION_PATTERN.exec(line);
      if (sectionMatch) {
        isEventsSection =
          sectionMatch[1].trim().toLowerCase() === ASS_EVENTS_SECTION_NAME;
        return true;
      }
      if (isEventsSection && ASS_FORMAT_LINE_PATTERN.test(line)) {
        formatLine = line;
        return true;
      }
      return !(
        isEventsSection &&
        ASS_DIALOGUE_LINE_PATTERN.test(line) &&
        isDroppedSegment(
          [ASS_PROBE_HEADER, formatLine, line].join(LINE_SEPARATOR),
        )
      );
    })
    .join(LINE_SEPARATOR);
};

const dropTimedTextBlocks = (text, isDroppedSegment) => {
  const segments = text.split(TIMED_TEXT_BLOCK_SEPARATOR_PATTERN);
  const droppedIndexes = new Set();
  segments.forEach((segment, segmentIndex) => {
    if (segmentIndex % 2 === 0 && isDroppedSegment(segment)) {
      droppedIndexes.add(segmentIndex);
      droppedIndexes.add(segmentIndex + 1);
    }
  });
  return segments
    .filter((_, segmentIndex) => !droppedIndexes.has(segmentIndex))
    .join('');
};

export const dropCues = ({bytes, isCueDropped, languageCodeHint}) => {
  const {text, encoding} = decodeSubtitleBytes(bytes, {languageCodeHint});
  const {subtitleFileFormat, cues} = parseSubtitleText({
    text,
    fileNameHint: null,
  });
  if (!cues.some(isCueDropped)) {
    return bytes;
  }
  const dropSegments = ASS_FILE_FORMATS.has(subtitleFileFormat)
    ? dropAssLines
    : dropTimedTextBlocks;
  if (encoding.startsWith(UTF16_ENCODING_PREFIX)) {
    return new TextEncoder().encode(
      dropSegments(text, segmentText =>
        hasOnlyDroppedCues(segmentText, isCueDropped),
      ),
    );
  }
  return fromByteText(
    dropSegments(toByteText(bytes), segmentByteText =>
      hasOnlyDroppedCues(
        decodeSubtitleBytesAs(fromByteText(segmentByteText), encoding),
        isCueDropped,
      ),
    ),
  );
};
