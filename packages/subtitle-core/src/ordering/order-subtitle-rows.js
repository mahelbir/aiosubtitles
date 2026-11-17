import {groupBy, orderBy, take, uniq} from 'es-toolkit';

const ROW_CRITERIA = [
  (row) => row.totalScore,
  (row) => row.siteDownloadCount ?? 0,
  (row) => row.urlCode,
];
const ROW_ORDERS = ['desc', 'desc', 'asc'];

export const orderSubtitleRows = ({rankedRows, languageCodes, subtitleLanguageLimit}) => {
  const rowsByLanguage = groupBy(rankedRows, (row) => row.languageCode);
  return uniq(languageCodes)
    .filter((languageCode) => Object.hasOwn(rowsByLanguage, languageCode))
    .flatMap((languageCode) =>
      take(orderBy(rowsByLanguage[languageCode], ROW_CRITERIA, ROW_ORDERS), subtitleLanguageLimit),
    );
};
