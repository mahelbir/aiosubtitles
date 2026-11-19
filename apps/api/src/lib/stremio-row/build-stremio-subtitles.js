import {countBy} from 'es-toolkit';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {buildSubtitleId} from './build-subtitle-id.js';
import {
  buildSubtitleLabel,
  getPresentReleaseName,
} from './build-subtitle-label.js';
import {buildSubtitleUrl} from './build-subtitle-url.js';

const getIdParts = row => ({
  subtitleSourceName: SubtitleSource.label(row.subtitleSource),
  releaseName: row.releaseNames[0] ?? null,
  urlCode: row.urlCode,
});

const toStremioSubtitle = ({row, url, id}) => {
  const subtitleFileName = getPresentReleaseName(row.subtitleFileName);
  return {
    id,
    url,
    lang: row.languageCode,
    label: buildSubtitleLabel({
      confidenceWord: row.confidenceWord,
      subtitleSourceName: SubtitleSource.label(row.subtitleSource),
      noteFlags: row,
      releaseName: subtitleFileName,
    }),
    ...(subtitleFileName === null ? {} : {subtitleFileName}),
  };
};

export const buildStremioSubtitles = ({
  rankedRows,
  baseUrl,
  userConfigId,
  videoId,
}) => {
  const listedRows = rankedRows
    .map(row => ({
      row,
      url: buildSubtitleUrl({
        baseUrl,
        userConfigId,
        videoId,
        urlCode: row.urlCode,
        fileExtension: row.fileExtension,
      }),
      shortId: buildSubtitleId(getIdParts(row)),
    }))
    .filter(({url}) => url !== null);
  const shortIdCounts = countBy(listedRows, ({shortId}) => shortId);
  return listedRows.map(({row, url, shortId}) =>
    toStremioSubtitle({
      row,
      url,
      id:
        shortIdCounts[shortId] > 1
          ? buildSubtitleId({...getIdParts(row), isFullUrlCode: true})
          : shortId,
    }),
  );
};
