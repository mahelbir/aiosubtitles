import {
  getPresentReleaseName,
  LABEL_SEPARATOR,
} from './build-subtitle-label.js';

const MAX_ID_BYTES = 255;
const SHORT_URL_CODE_LENGTH = 8;
const SINGLE_LINE_BREAKER_PATTERN = /[\p{Cc}\p{Zl}\p{Zp}]/gu;
const textEncoder = new TextEncoder();
const graphemeSegmenter = new Intl.Segmenter();

const getByteLength = text => textEncoder.encode(text).length;

const cutToByteLength = (text, maxByteLength) => {
  let cutText = '';
  let cutByteLength = 0;
  for (const {segment} of graphemeSegmenter.segment(text)) {
    const segmentByteLength = getByteLength(segment);
    if (cutByteLength + segmentByteLength > maxByteLength) {
      break;
    }
    cutText += segment;
    cutByteLength += segmentByteLength;
  }
  return cutText;
};

export const buildSubtitleId = ({
  subtitleSourceName,
  releaseName,
  urlCode,
  isFullUrlCode = false,
}) => {
  const codePart = isFullUrlCode
    ? urlCode
    : urlCode.slice(0, SHORT_URL_CODE_LENGTH);
  const fixedByteLength = getByteLength(
    [subtitleSourceName, '', codePart].join(LABEL_SEPARATOR),
  );
  const releasePart = getPresentReleaseName(
    cutToByteLength(
      (releaseName ?? '').replace(SINGLE_LINE_BREAKER_PATTERN, ' '),
      MAX_ID_BYTES - fixedByteLength,
    ),
  );
  return [subtitleSourceName, releasePart, codePart]
    .filter(idPart => idPart !== null)
    .join(LABEL_SEPARATOR);
};
