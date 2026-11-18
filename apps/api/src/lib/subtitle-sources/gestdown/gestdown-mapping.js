import {StatusCodes} from 'http-status-codes';
import {isNil} from 'es-toolkit';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {VideoType} from '@repo/shared/constants/video-type.js';
import {SubtitleFileExtension} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {
  SiteLanguageCodeStyle,
  toSiteLanguageCodes,
} from '../site-language-codes.js';
import {
  toHitReleaseNames,
  toHitSiteFileId,
} from '../subtitle-source-contract.js';
import {
  readSubtitleSourceFileName,
  toSubtitleSourceStatusError,
} from '../subtitle-source-request.js';

const GESTDOWN_URL = 'https://api.gestdown.info';
const GESTDOWN_LANGUAGE_CODES = new Map([
  [SubtitleLanguage.POR, 'pt'],
  [SubtitleLanguage.ZHO, 'zh-hans'],
  [SubtitleLanguage.SPL, 'es-419'],
]);

function toSiteId(siteId) {
  return typeof siteId === 'string' ? toHitSiteFileId(siteId) : null;
}

function toGestdownLanguageCode(languageCode) {
  return (
    GESTDOWN_LANGUAGE_CODES.get(languageCode) ??
    toSiteLanguageCodes([languageCode], SiteLanguageCodeStyle.LOCALE)[0] ??
    null
  );
}

function buildRequest(url, requestOptions = {}) {
  return {
    subtitleSource: SubtitleSource.GESTDOWN,
    url,
    method: 'GET',
    headers: {},
    responseType: 'json',
    acceptedStatuses: [],
    credentialId: null,
    ...requestOptions,
  };
}

function buildShowRequest({videoType, tvdbId, catalogSeason, catalogEpisode}) {
  if (
    videoType !== VideoType.SERIES ||
    !tvdbId ||
    isNil(catalogSeason) ||
    isNil(catalogEpisode)
  ) {
    return null;
  }
  return buildRequest(
    `${GESTDOWN_URL}/shows/external/tvdb/${encodeURIComponent(tvdbId)}`,
  );
}

function findShowId({body}, {tvdbId}) {
  const shows = body?.shows;
  if (!Array.isArray(shows)) {
    return null;
  }
  const matchingShow = shows.find(
    show => !isNil(show?.tvDbId) && String(show.tvDbId) === tvdbId,
  );
  return toSiteId(matchingShow?.id);
}

function buildSubtitlesRequest(
  showId,
  {catalogSeason, catalogEpisode},
  languageCode,
) {
  const siteLanguageCode = toGestdownLanguageCode(languageCode);
  if (siteLanguageCode === null) {
    return null;
  }
  const pathSegments = [
    showId,
    catalogSeason,
    catalogEpisode,
    siteLanguageCode,
  ].map(pathSegment => encodeURIComponent(pathSegment));
  return buildRequest(
    `${GESTDOWN_URL}/subtitles/get/${pathSegments.join('/')}`,
    {acceptedStatuses: [StatusCodes.LOCKED]},
  );
}

function toSiteDownloadCount(downloadCount) {
  return Number.isSafeInteger(downloadCount) && downloadCount >= 0
    ? downloadCount
    : null;
}

function toSearchHit(siteSubtitle, languageCode) {
  const siteFileId = toSiteId(siteSubtitle?.subtitleId);
  if (siteFileId === null || siteSubtitle.completed === false) {
    return null;
  }
  const releaseName = siteSubtitle.release || siteSubtitle.version;
  return {
    subtitleSource: SubtitleSource.GESTDOWN,
    siteFileId,
    languageCode,
    releaseNames: toHitReleaseNames(
      typeof releaseName === 'string' ? [releaseName] : [],
    ),
    fileExtension: SubtitleFileExtension.SRT,
    isSitePack: false,
    isHearingImpaired:
      typeof siteSubtitle.hearingImpaired === 'boolean'
        ? siteSubtitle.hearingImpaired
        : null,
    isForced: null,
    isMachineTranslated: null,
    isUploaderTrusted: null,
    isQuotaCostly: false,
    siteDownloadCount: toSiteDownloadCount(siteSubtitle.downloadCount),
    siteFps: null,
    siteFileUrl: null,
    siteCueCount: null,
    siteDurationMs: null,
    hashMatchVideoHashes: [],
    subtitleAliases: [],
  };
}

function toSearchHits({body}, languageCode) {
  const siteSubtitles = body?.matchingSubtitles;
  if (!Array.isArray(siteSubtitles)) {
    return [];
  }
  return siteSubtitles
    .map(siteSubtitle => toSearchHit(siteSubtitle, languageCode))
    .filter(Boolean);
}

function buildDownloadRequest({siteFileId}) {
  return buildRequest(
    `${GESTDOWN_URL}/subtitles/download/${encodeURIComponent(siteFileId)}`,
    {responseType: 'bytes'},
  );
}

function toDownload(response) {
  if (response.status === StatusCodes.NOT_FOUND) {
    throw toSubtitleSourceStatusError(response, {
      subtitleSource: SubtitleSource.GESTDOWN,
    });
  }
  return {
    fileBytes: response.body,
    fileNameHint: readSubtitleSourceFileName(response.headers),
    extractedEntryPath: null,
  };
}

export const gestdownMapping = {
  buildShowRequest,
  findShowId,
  buildSubtitlesRequest,
  toSearchHits,
  buildDownloadRequest,
  toDownload,
};
