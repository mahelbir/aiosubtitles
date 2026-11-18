import {isNil} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {VideoType} from '@repo/shared/constants/video-type.js';
import {httpUrlField} from '@repo/shared/schemas/common.js';
import {SubtitleFileExtension} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {fromSiteLanguageCode} from '../site-language-codes.js';
import {
  SITE_FILE_ID_LENGTH_MAX,
  toHitReleaseNames,
} from '../subtitle-source-contract.js';
import {SourceUnavailableError} from '../subtitle-source-errors.js';
import {
  isPrivateSubtitleSourceUrl,
  readSubtitleSourceFileName,
  toSubtitleSourceStatusError,
} from '../subtitle-source-request.js';

const OPENSUBTITLES_V3_URL = 'https://opensubtitles-v3.strem.io';
const IMDB_VIDEO_ID_SEPARATOR = ':';
const FPS_MILLI_PER_FPS = 1000;

function buildRequest(url, requestOptions = {}) {
  return {
    subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
    url,
    method: 'GET',
    headers: {},
    responseType: 'json',
    acceptedStatuses: [],
    credentialId: null,
    ...requestOptions,
  };
}

function isSiteFileUrl(siteFileUrl) {
  return (
    httpUrlField.safeParse(siteFileUrl).success &&
    !isPrivateSubtitleSourceUrl(siteFileUrl)
  );
}

function toSiteFileId(siteFileId) {
  if (typeof siteFileId === 'string') {
    const trimmedSiteFileId = siteFileId.trim();
    return trimmedSiteFileId.length <= SITE_FILE_ID_LENGTH_MAX
      ? trimmedSiteFileId || null
      : null;
  }
  return Number.isSafeInteger(siteFileId) && siteFileId > 0
    ? String(siteFileId)
    : null;
}

function toSiteFps(fpsMilli) {
  return Number.isFinite(fpsMilli) && fpsMilli > 0
    ? fpsMilli / FPS_MILLI_PER_FPS
    : null;
}

function buildImdbVideoId({videoType, imdbId, catalogSeason, catalogEpisode}) {
  if (videoType === VideoType.MOVIE) {
    return encodeURIComponent(imdbId);
  }
  if (isNil(catalogSeason) || isNil(catalogEpisode)) {
    return null;
  }
  return [imdbId, catalogSeason, catalogEpisode]
    .map(idPart => encodeURIComponent(idPart))
    .join(IMDB_VIDEO_ID_SEPARATOR);
}

function buildSearchRequest(searchQuery) {
  const imdbVideoId = searchQuery.imdbId ? buildImdbVideoId(searchQuery) : null;
  if (imdbVideoId === null) {
    return null;
  }
  return buildRequest(
    `${OPENSUBTITLES_V3_URL}/subtitles/${encodeURIComponent(searchQuery.videoType)}/${imdbVideoId}.json`,
  );
}

function toSearchHit(siteSubtitle, languageCodes) {
  const languageCode = fromSiteLanguageCode(siteSubtitle?.lang);
  const siteFileId = toSiteFileId(siteSubtitle?.id);
  if (
    !languageCodes.has(languageCode) ||
    siteFileId === null ||
    !isSiteFileUrl(siteSubtitle.url)
  ) {
    return null;
  }
  return {
    subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
    siteFileId,
    languageCode,
    releaseNames: toHitReleaseNames(
      [siteSubtitle.movieReleaseName, siteSubtitle.subtitleFileName].filter(
        releaseName => typeof releaseName === 'string',
      ),
    ),
    fileExtension: SubtitleFileExtension.SRT,
    isSitePack: false,
    isHearingImpaired: null,
    isForced: null,
    isMachineTranslated: null,
    isUploaderTrusted: null,
    isQuotaCostly: false,
    siteDownloadCount: null,
    siteFps: toSiteFps(siteSubtitle.fpsMilli),
    siteFileUrl: siteSubtitle.url,
    siteCueCount: null,
    siteDurationMs: null,
    hashMatchVideoHashes: [],
    subtitleAliases: [],
  };
}

function toSearchHits({body}, {languageCodes}) {
  const siteSubtitles = body?.subtitles;
  if (!Array.isArray(siteSubtitles)) {
    return [];
  }
  const askedLanguageCodes = new Set(languageCodes);
  return siteSubtitles
    .map(siteSubtitle => toSearchHit(siteSubtitle, askedLanguageCodes))
    .filter(Boolean);
}

function buildDownloadRequest({siteFileUrl}) {
  if (!isSiteFileUrl(siteFileUrl)) {
    throw new SourceUnavailableError({
      subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
      cause: new Error('No downloadable file url.'),
    });
  }
  return buildRequest(siteFileUrl, {responseType: 'bytes'});
}

function toDownload(response) {
  if (response.status === StatusCodes.NOT_FOUND) {
    throw toSubtitleSourceStatusError(response, {
      subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
    });
  }
  return {
    fileBytes: response.body,
    fileNameHint: readSubtitleSourceFileName(response.headers),
    extractedEntryPath: null,
  };
}

export const opensubtitlesV3Mapping = {
  buildSearchRequest,
  toSearchHits,
  buildDownloadRequest,
  toDownload,
};
