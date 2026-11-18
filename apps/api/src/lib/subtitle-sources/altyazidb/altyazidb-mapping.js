import {isNil, isString, uniqBy} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {VideoType} from '@repo/shared/constants/video-type.js';
import {SubtitleFileExtension} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {
  fromSiteLanguageCode,
  toSiteLanguageCodes,
} from '../site-language-codes.js';
import {toHitReleaseNames} from '../subtitle-source-contract.js';
import {SourceUnavailableError} from '../subtitle-source-errors.js';
import {
  isSubtitleSourceJsonResponse,
  readSubtitleSourceFileName,
  toSubtitleSourceStatusError,
} from '../subtitle-source-request.js';

const ALTYAZIDB_API_URL = 'https://altyazidb.com/api/v1/';
const ALTYAZIDB_SITE_LANGUAGE_CODES = new Set(['tr', 'en']);
const PACK_EPISODE = 'PAKET';
const SEARCH_RESULTS_MAX = 50;
const SITE_FILE_ID_PATTERN = /^\d+$/;
const DURATION_PATTERN =
  /^(\d{1,2})[:.]([0-5]\d)[:.]([0-5]\d)(?:[.,](\d{1,3}))?$/;
const MILLISECONDS_DIGITS = 3;
const EPISODE_CODE_DIGITS = 2;
const CREDENTIAL_STATUS_BY_STATUS = new Map([
  [StatusCodes.UNAUTHORIZED, CredentialStatus.INVALID],
  [StatusCodes.FORBIDDEN, CredentialStatus.INVALID],
  [StatusCodes.TOO_MANY_REQUESTS, CredentialStatus.LIMITED],
]);

function toList(siteValue) {
  return Array.isArray(siteValue) ? siteValue : [];
}

function toSiteFlag(siteValue) {
  return isNil(siteValue) ? null : Number(siteValue) === 1;
}

function toSiteCount(siteValue) {
  const siteCount = isNil(siteValue) ? Number.NaN : Number(siteValue);
  return Number.isSafeInteger(siteCount) && siteCount >= 0 ? siteCount : null;
}

function toDurationMs(siteDuration) {
  const durationMatch = isString(siteDuration)
    ? siteDuration.trim().match(DURATION_PATTERN)
    : null;
  if (durationMatch === null) {
    return null;
  }
  const [, hours, minutes, seconds, fraction = ''] = durationMatch;
  const totalSeconds =
    (Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds);
  return (
    totalSeconds * 1000 + Number(fraction.padEnd(MILLISECONDS_DIGITS, '0'))
  );
}

function toSiteFileId(siteId) {
  const siteFileId =
    isString(siteId) || Number.isSafeInteger(siteId) ? String(siteId) : '';
  return SITE_FILE_ID_PATTERN.test(siteFileId) ? siteFileId : null;
}

function toEpisodeCode(catalogNumber) {
  return String(catalogNumber).padStart(EPISODE_CODE_DIGITS, '0');
}

function isPackEpisodeRef({catalogSeason, catalogEpisode, isSitePack}) {
  return isSitePack === true && !isNil(catalogSeason) && !isNil(catalogEpisode);
}

function toStatusError(response) {
  return toSubtitleSourceStatusError(response, {
    subtitleSource: SubtitleSource.ALTYAZIDB,
  });
}

function buildRequest(sitePath, siteParams, credential, requestOptions = {}) {
  const requestUrl = new URL(sitePath, ALTYAZIDB_API_URL);
  requestUrl.search = new URLSearchParams(siteParams).toString();
  return {
    subtitleSource: SubtitleSource.ALTYAZIDB,
    url: requestUrl.href,
    method: 'GET',
    headers: credential?.apiKey ? {'X-API-Key': credential.apiKey} : {},
    responseType: 'json',
    acceptedStatuses: [],
    credentialId: credential?.credentialId ?? null,
    ...requestOptions,
  };
}

function listSearchEpisodes({videoType, catalogSeason, catalogEpisode}) {
  if (videoType === VideoType.MOVIE) {
    return [{episodeParams: {}, isPackSearch: false}];
  }
  if (isNil(catalogSeason) || isNil(catalogEpisode)) {
    return [];
  }
  const season = String(catalogSeason);
  return [
    {
      episodeParams: {season, episode: String(catalogEpisode)},
      isPackSearch: false,
    },
    {episodeParams: {season, episode: PACK_EPISODE}, isPackSearch: true},
  ];
}

function buildSearchRequests(searchQuery, credential) {
  if (!credential?.apiKey || !searchQuery.imdbId) {
    return [];
  }
  const siteLanguageCodes = toSiteLanguageCodes(
    searchQuery.languageCodes,
  ).filter(siteLanguageCode =>
    ALTYAZIDB_SITE_LANGUAGE_CODES.has(siteLanguageCode),
  );
  const searchEpisodes = listSearchEpisodes(searchQuery);
  return siteLanguageCodes.flatMap(siteLanguageCode =>
    searchEpisodes.map(({episodeParams, isPackSearch}) => ({
      searchRequest: buildRequest(
        'search',
        {
          imdb_id: searchQuery.imdbId,
          lang: siteLanguageCode,
          ...episodeParams,
          limit: String(SEARCH_RESULTS_MAX),
        },
        credential,
      ),
      isPackSearch,
    })),
  );
}

function isOtherSiteNumber(siteNumber, catalogNumber) {
  return (
    !isNil(catalogNumber) &&
    !isNil(siteNumber) &&
    Number(siteNumber) !== catalogNumber
  );
}

function isOffTarget(
  siteSubtitle,
  isSitePack,
  {catalogSeason, catalogEpisode},
) {
  return (
    isOtherSiteNumber(siteSubtitle.season, catalogSeason) ||
    (!isSitePack && isOtherSiteNumber(siteSubtitle.episode, catalogEpisode))
  );
}

function toSearchHit(siteSubtitle, searchContext) {
  const languageCode = fromSiteLanguageCode(siteSubtitle?.language);
  const siteFileId = toSiteFileId(siteSubtitle?.id);
  if (languageCode === null || siteFileId === null) {
    return null;
  }
  const isSitePack =
    searchContext.isPackSearch || toSiteFlag(siteSubtitle.is_package) === true;
  if (isOffTarget(siteSubtitle, isSitePack, searchContext)) {
    return null;
  }
  return {
    subtitleSource: SubtitleSource.ALTYAZIDB,
    siteFileId,
    languageCode,
    releaseNames: toHitReleaseNames(
      [
        ...toList(siteSubtitle.versions).map(siteVersion => siteVersion?.file),
        ...toList(siteSubtitle.releases),
      ].filter(isString),
    ),
    fileExtension: SubtitleFileExtension.SRT,
    isSitePack,
    isHearingImpaired: toSiteFlag(siteSubtitle.hearing_impaired),
    isForced: toSiteFlag(siteSubtitle.forced),
    isMachineTranslated: toSiteFlag(siteSubtitle.ai_ceviri),
    isUploaderTrusted: null,
    isQuotaCostly: null,
    siteDownloadCount: toSiteCount(siteSubtitle.downloads),
    siteFps: Math.max(Number(siteSubtitle.fps), 0) || null,
    siteFileUrl: null,
    siteCueCount: null,
    siteDurationMs: toDurationMs(
      siteSubtitle.duration ?? siteSubtitle.sure_bilgisi,
    ),
    hashMatchVideoHashes: [],
    subtitleAliases: [],
  };
}

function toSearchHits(
  {body},
  {isPackSearch, catalogSeason = null, catalogEpisode = null},
) {
  if (body?.success === false) {
    throw new SourceUnavailableError({
      subtitleSource: SubtitleSource.ALTYAZIDB,
      cause: new Error('Error envelope.'),
    });
  }
  const searchContext = {isPackSearch, catalogSeason, catalogEpisode};
  return toList(body?.data)
    .map(siteSubtitle => toSearchHit(siteSubtitle, searchContext))
    .filter(Boolean);
}

function mergeSearchHits(hitLists) {
  return uniqBy(
    hitLists
      .flat()
      .toSorted(
        (leftHit, rightHit) =>
          Number(rightHit.isSitePack) - Number(leftHit.isSitePack),
      ),
    hit => hit.siteFileId,
  );
}

function buildDownloadRequest(subtitleRef, credential) {
  return buildRequest(
    'subtitle',
    {
      sub_id: subtitleRef.siteFileId,
      ...(isPackEpisodeRef(subtitleRef)
        ? {
            season: String(subtitleRef.catalogSeason),
            episode: String(subtitleRef.catalogEpisode),
          }
        : {}),
    },
    credential,
    {responseType: 'bytes'},
  );
}

function toDownload(response, subtitleRef) {
  if (response.status === StatusCodes.NOT_FOUND) {
    throw toStatusError(response);
  }
  if (isSubtitleSourceJsonResponse(response.headers)) {
    throw new SourceUnavailableError({
      subtitleSource: SubtitleSource.ALTYAZIDB,
      cause: new Error('JSON error body.'),
    });
  }
  return {
    fileBytes: response.body,
    fileNameHint: readSubtitleSourceFileName(response.headers),
    extractedEntryPath: isPackEpisodeRef(subtitleRef)
      ? `S${toEpisodeCode(subtitleRef.catalogSeason)}E${toEpisodeCode(subtitleRef.catalogEpisode)}`
      : null,
  };
}

function buildCredentialCheckRequest(credential) {
  return buildRequest('me', {}, credential, {
    responseType: 'text',
    acceptedStatuses: [...CREDENTIAL_STATUS_BY_STATUS.keys()],
  });
}

function toCredentialCheck(response) {
  if (response.status === StatusCodes.NOT_FOUND) {
    throw toStatusError(response);
  }
  return {
    credentialStatus:
      CREDENTIAL_STATUS_BY_STATUS.get(response.status) ??
      CredentialStatus.VALID,
    quotaRemainingCount: null,
    quotaAllowedCount: null,
    quotaResetAt: null,
  };
}

export const altyazidbMapping = {
  buildSearchRequests,
  toSearchHits,
  mergeSearchHits,
  buildDownloadRequest,
  toDownload,
  buildCredentialCheckRequest,
  toCredentialCheck,
};
