import {StatusCodes} from 'http-status-codes';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SubtitleFileExtension} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {fromSiteLanguageCode} from '../site-language-codes.js';
import {
  buildImdbVideoId,
  toHitReleaseNames,
  toHitSiteFileId,
} from '../subtitle-source-contract.js';
import {SourceUnavailableError} from '../subtitle-source-errors.js';
import {
  isSubtitleSourceFileUrl,
  readSubtitleSourceFileName,
  requireSubtitleSourceList,
  toSubtitleSourceStatusError,
} from '../subtitle-source-request.js';

const OPENSUBTITLES_V3_URL = 'https://opensubtitles-v3.strem.io';
const FPS_MILLI_PER_FPS = 1000;
const OPENSUBTITLES_V3_LANGUAGE_CODES = new Map([
  ['zht', SubtitleLanguage.ZHO],
  ['spn', SubtitleLanguage.SPA],
  ['scc', SubtitleLanguage.SRP],
  ['mne', SubtitleLanguage.SRP],
]);

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

function toSiteFps(fpsMilli) {
  return Number.isFinite(fpsMilli) && fpsMilli > 0
    ? fpsMilli / FPS_MILLI_PER_FPS
    : null;
}

function buildSearchRequest(searchQuery) {
  const imdbVideoId = buildImdbVideoId(searchQuery);
  if (imdbVideoId === null) {
    return null;
  }
  return buildRequest(
    `${OPENSUBTITLES_V3_URL}/subtitles/${encodeURIComponent(searchQuery.videoType)}/${imdbVideoId}.json`,
  );
}

function toSearchHit(siteSubtitle, languageCodes) {
  const languageCode = fromSiteLanguageCode(
    siteSubtitle?.lang,
    OPENSUBTITLES_V3_LANGUAGE_CODES,
  );
  const siteFileId = toHitSiteFileId(siteSubtitle?.id);
  if (
    !languageCodes.has(languageCode) ||
    siteFileId === null ||
    !isSubtitleSourceFileUrl(siteSubtitle.url)
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

function toSearchHits({status, body}, {languageCodes}) {
  if (status === StatusCodes.NOT_FOUND) {
    return [];
  }
  const siteSubtitles = requireSubtitleSourceList(body?.subtitles, {
    subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
  });
  const askedLanguageCodes = new Set(languageCodes);
  return siteSubtitles
    .map(siteSubtitle => toSearchHit(siteSubtitle, askedLanguageCodes))
    .filter(Boolean);
}

function buildDownloadRequest({siteFileUrl}) {
  if (!isSubtitleSourceFileUrl(siteFileUrl)) {
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
