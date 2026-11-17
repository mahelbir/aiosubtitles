const SUBTITLE_SOURCE_START = '[';
const SUBTITLE_SOURCE_END = '] ';
const NAMES_START = ' | ';
const STATUS_SEPARATOR = ' · ';
const RELEASE_NAME_SEPARATOR = ' _ ';
const DUPLICATE_SUFFIX_PATTERN = / \((\d{1,2})\)$/;

const FREE_STATUS = '✓ Ücretsiz';
const QUOTA_COSTLY_STATUS = '1 hak harcar';
const HEARING_IMPAIRED_FLAG = 'HI';
const FORCED_FLAG = 'Yabancı konuşmalar';
const OFFICIAL_ADDON_FLAG = 'Resmi';

export class RowIdFormatError extends Error {
  constructor(message = 'A rowId does not follow the Orion grammar.') {
    super(message);
    this.name = 'RowIdFormatError';
  }
}

export const parseRowId = rowId => {
  const subtitleSourceEnd = rowId.indexOf(SUBTITLE_SOURCE_END);
  const namesStart =
    subtitleSourceEnd < 0 ? -1 : rowId.indexOf(NAMES_START, subtitleSourceEnd);
  if (!rowId.startsWith(SUBTITLE_SOURCE_START) || namesStart < 0) {
    throw new RowIdFormatError();
  }
  const statusParts = rowId
    .slice(subtitleSourceEnd + SUBTITLE_SOURCE_END.length, namesStart)
    .split(STATUS_SEPARATOR);
  const namesText = rowId.slice(namesStart + NAMES_START.length);
  const duplicateMatch = DUPLICATE_SUFFIX_PATTERN.exec(namesText);
  const releaseNamesText = duplicateMatch
    ? namesText.slice(0, duplicateMatch.index)
    : namesText;
  return {
    subtitleSourceName: rowId.slice(
      SUBTITLE_SOURCE_START.length,
      subtitleSourceEnd,
    ),
    isFree: statusParts[0] === FREE_STATUS,
    isQuotaCostly: statusParts[0] === QUOTA_COSTLY_STATUS,
    isHearingImpaired: statusParts.includes(HEARING_IMPAIRED_FLAG),
    isForced: statusParts.includes(FORCED_FLAG),
    isOfficialAddon: statusParts.includes(OFFICIAL_ADDON_FLAG),
    releaseNames: releaseNamesText
      .split(RELEASE_NAME_SEPARATOR)
      .map(releaseName => releaseName.trim()),
    duplicateIndex: duplicateMatch ? Number(duplicateMatch[1]) : null,
  };
};
