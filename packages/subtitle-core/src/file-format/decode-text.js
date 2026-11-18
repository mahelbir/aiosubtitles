import {analyse} from 'chardet';
import {trimEnd} from 'es-toolkit';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';

const BYTE_ORDER_MARKS = [
  {markBytes: [0xef, 0xbb, 0xbf], encoding: 'utf-8'},
  {markBytes: [0xff, 0xfe], encoding: 'utf-16le'},
  {markBytes: [0xfe, 0xff], encoding: 'utf-16be'},
];
const UTF8_ENCODING = 'utf-8';
const LEGACY_ENCODING_FALLBACK = 'windows-1252';
const UTF16_ZERO_BYTE_SHARE_MIN = 0.3;
const UTF16_STRAY_ZERO_BYTE_SHARE_MAX = 0.05;
const UTF8_REPLACEMENT_SHARE_MAX = 0.05;
const LEGACY_DETECTION_CONFIDENCE_MIN = 40;
const NULL_CHARACTER = String.fromCharCode(0);
const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);
const ASCII_CODE_POINT_MAX = 0x7f;

const CODE_PAGE_FAMILIES = [
  ['windows-1250', 'iso-8859-2'],
  ['windows-1251', 'iso-8859-5', 'koi8-r', 'ibm866'],
  ['windows-1252', 'iso-8859-1', 'iso-8859-15'],
  ['windows-1253', 'iso-8859-7'],
  ['windows-1254', 'iso-8859-9'],
  ['windows-1255', 'iso-8859-8', 'iso-8859-8-i'],
  ['windows-1256', 'iso-8859-6'],
];
const CODE_PAGE_FAMILY_BY_ENCODING = new Map(
  CODE_PAGE_FAMILIES.flatMap(([familyCodePage, ...memberEncodings]) =>
    [familyCodePage, ...memberEncodings].map(encoding => [
      encoding,
      familyCodePage,
    ]),
  ),
);

const toCodePageEntries = (languageCodes, codePages) =>
  languageCodes.map(languageCode => [languageCode, codePages]);

const LEGACY_CODE_PAGES_BY_LANGUAGE = new Map([
  ...toCodePageEntries([SubtitleLanguage.TUR], ['windows-1254']),
  ...toCodePageEntries(
    [SubtitleLanguage.SRP],
    ['windows-1250', 'windows-1251'],
  ),
  ...toCodePageEntries(
    [
      SubtitleLanguage.ENG,
      SubtitleLanguage.FRE,
      SubtitleLanguage.GER,
      SubtitleLanguage.SPA,
      SubtitleLanguage.SPL,
      SubtitleLanguage.ITA,
      SubtitleLanguage.POR,
      SubtitleLanguage.POB,
      SubtitleLanguage.NLD,
      SubtitleLanguage.SWE,
      SubtitleLanguage.NOR,
      SubtitleLanguage.NOB,
      SubtitleLanguage.DAN,
      SubtitleLanguage.FIN,
      SubtitleLanguage.ISL,
      SubtitleLanguage.CAT,
      SubtitleLanguage.GLG,
      SubtitleLanguage.EUS,
      SubtitleLanguage.AFR,
      SubtitleLanguage.IND,
      SubtitleLanguage.MSA,
    ],
    ['windows-1252'],
  ),
  ...toCodePageEntries(
    [
      SubtitleLanguage.POL,
      SubtitleLanguage.CES,
      SubtitleLanguage.SLK,
      SubtitleLanguage.HUN,
      SubtitleLanguage.RON,
      SubtitleLanguage.HRV,
      SubtitleLanguage.SLV,
      SubtitleLanguage.BOS,
      SubtitleLanguage.SQI,
    ],
    ['windows-1250'],
  ),
  ...toCodePageEntries(
    [
      SubtitleLanguage.RUS,
      SubtitleLanguage.UKR,
      SubtitleLanguage.BEL,
      SubtitleLanguage.BUL,
      SubtitleLanguage.MKD,
    ],
    ['windows-1251'],
  ),
  ...toCodePageEntries([SubtitleLanguage.ELL], ['windows-1253']),
  ...toCodePageEntries([SubtitleLanguage.HEB], ['windows-1255']),
  ...toCodePageEntries(
    [SubtitleLanguage.ARA, SubtitleLanguage.FAS],
    ['windows-1256'],
  ),
]);

const toWhatwgEncoding = encodingLabel => {
  try {
    return new TextDecoder(encodingLabel).encoding;
  } catch {
    return null;
  }
};

const decodeAs = (bytes, encoding) => new TextDecoder(encoding).decode(bytes);

const findByteOrderMark = bytes =>
  BYTE_ORDER_MARKS.find(({markBytes}) =>
    markBytes.every((markByte, byteIndex) => bytes[byteIndex] === markByte),
  );

const detectUtf16WithoutMark = bytes => {
  const zeroByteCounts = [0, 0];
  bytes.forEach((byte, byteIndex) => {
    if (byte === 0) {
      zeroByteCounts[byteIndex % 2] += 1;
    }
  });
  const codeUnitCount = Math.floor(bytes.length / 2);
  if (codeUnitCount === 0) {
    return null;
  }
  const [evenZeroShare, oddZeroShare] = zeroByteCounts.map(
    zeroByteCount => zeroByteCount / codeUnitCount,
  );
  const isOnlyShare = (share, otherShare) =>
    share >= UTF16_ZERO_BYTE_SHARE_MIN &&
    otherShare <= UTF16_STRAY_ZERO_BYTE_SHARE_MAX;
  if (isOnlyShare(oddZeroShare, evenZeroShare)) {
    return 'utf-16le';
  }
  if (isOnlyShare(evenZeroShare, oddZeroShare)) {
    return 'utf-16be';
  }
  return null;
};

const dropTrailingNullBytes = bytes => {
  let textByteCount = bytes.length;
  while (textByteCount > 0 && bytes[textByteCount - 1] === 0) {
    textByteCount -= 1;
  }
  return bytes.subarray(0, textByteCount);
};

const isMostlyUtf8 = bytes => {
  const text = decodeAs(bytes, UTF8_ENCODING);
  if (text.includes(NULL_CHARACTER)) {
    return false;
  }
  let replacementCount = 0;
  let multibyteCount = 0;
  for (const character of text) {
    if (character === REPLACEMENT_CHARACTER) {
      replacementCount += 1;
    } else if (character.codePointAt(0) > ASCII_CODE_POINT_MAX) {
      multibyteCount += 1;
    }
  }
  const sequenceCount = replacementCount + multibyteCount;
  return (
    sequenceCount === 0 ||
    replacementCount / sequenceCount <= UTF8_REPLACEMENT_SHARE_MAX
  );
};

const toCodePageFamily = encoding =>
  CODE_PAGE_FAMILY_BY_ENCODING.get(encoding) ?? encoding;

const detectLegacyEncoding = (bytes, languageCodeHint) => {
  const candidates = analyse(bytes)
    .map(({name, confidence}) => ({
      encoding: toWhatwgEncoding(name),
      confidence,
    }))
    .filter(({encoding}) => encoding);
  const [topCandidate] = candidates;
  const hintCodePages = LEGACY_CODE_PAGES_BY_LANGUAGE.get(languageCodeHint);
  const isDetectionConfident =
    topCandidate?.confidence >= LEGACY_DETECTION_CONFIDENCE_MIN;
  if (hintCodePages && !isDetectionConfident) {
    const candidateFamilies = new Set(
      candidates.map(({encoding}) => toCodePageFamily(encoding)),
    );
    return (
      hintCodePages.find(codePage => candidateFamilies.has(codePage)) ??
      hintCodePages[0]
    );
  }
  return topCandidate
    ? toCodePageFamily(topCandidate.encoding)
    : LEGACY_ENCODING_FALLBACK;
};

export const decodeSubtitleBytesAs = (bytes, encoding) =>
  trimEnd(decodeAs(bytes, encoding), NULL_CHARACTER);

export const decodeSubtitleBytes = (bytes, {languageCodeHint} = {}) => {
  const byteOrderMark = findByteOrderMark(bytes);
  const markedEncoding =
    byteOrderMark?.encoding ?? detectUtf16WithoutMark(bytes);
  if (markedEncoding) {
    return {
      text: trimEnd(decodeAs(bytes, markedEncoding), NULL_CHARACTER),
      encoding: markedEncoding,
    };
  }
  const textBytes = dropTrailingNullBytes(bytes);
  const encoding = isMostlyUtf8(textBytes)
    ? UTF8_ENCODING
    : detectLegacyEncoding(textBytes, languageCodeHint);
  return {text: decodeAs(textBytes, encoding), encoding};
};
