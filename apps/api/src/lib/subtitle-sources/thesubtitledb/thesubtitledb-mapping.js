import {chunk, isNil} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {VideoType} from '@repo/shared/constants/video-type.js';
import {
  fromSiteLanguageCode,
  toSiteLanguageCodes,
} from '../site-language-codes.js';
import {
  isSupportedSubtitleSourceFormat,
  toHitFileExtension,
  toHitReleaseNames,
} from '../subtitle-source-contract.js';
import {
  readSubtitleSourceFileName,
  requireSubtitleSourceList,
  toSubtitleSourceStatusError,
} from '../subtitle-source-request.js';

const THESUBTITLEDB_API_URL = 'https://api.thesubtitledb.org';
const SEARCH_RESULTS_MAX = 100;
const SEARCH_LANGUAGE_CODES_MAX = 16;
const CREDENTIAL_CHECK_IMDB_ID = 'tt0133093';
const RELEASE_NAME_SEPARATOR_PATTERN = /\r?\n/;
const MACHINE_TRANSLATED_BY_AI_KIND = new Map([
  [null, false],
  ['translated', true],
  ['transcribed', null],
]);
const CREDENTIAL_STATUS_BY_STATUS = new Map([
  [StatusCodes.UNAUTHORIZED, CredentialStatus.INVALID],
  [StatusCodes.FORBIDDEN, CredentialStatus.INVALID],
  [StatusCodes.TOO_MANY_REQUESTS, CredentialStatus.LIMITED],
]);

function isSiteFileId(siteFileId) {
  return Number.isSafeInteger(siteFileId) && siteFileId > 0;
}

function toStatusError(response) {
  return toSubtitleSourceStatusError(response, {
    subtitleSource: SubtitleSource.THESUBTITLEDB,
  });
}

function buildRequest(sitePath, credential, requestOptions = {}) {
  return {
    subtitleSource: SubtitleSource.THESUBTITLEDB,
    url: new URL(sitePath, THESUBTITLEDB_API_URL).href,
    method: 'GET',
    headers: credential ? {Authorization: `Bearer ${credential.apiKey}`} : {},
    responseType: 'json',
    acceptedStatuses: [],
    credentialId: credential?.credentialId ?? null,
    ...requestOptions,
  };
}

function buildLookupPath({videoType, imdbId, catalogSeason, catalogEpisode}) {
  const titlePath = `/v1/by-imdb/${encodeURIComponent(imdbId)}`;
  if (videoType === VideoType.MOVIE) {
    return titlePath;
  }
  if (isNil(catalogSeason) || isNil(catalogEpisode)) {
    return null;
  }
  return `${titlePath}/season/${catalogSeason}/episode/${catalogEpisode}`;
}

function buildSearchRequests(searchQuery, credential) {
  const siteLanguageCodes = toSiteLanguageCodes(searchQuery.languageCodes);
  const lookupPath = searchQuery.imdbId ? buildLookupPath(searchQuery) : null;
  if (lookupPath === null || siteLanguageCodes.length === 0) {
    return null;
  }
  return chunk(siteLanguageCodes, SEARCH_LANGUAGE_CODES_MAX).map(
    lookupLanguageCodes => {
      const searchParams = new URLSearchParams({
        lang: lookupLanguageCodes.join(','),
        limit: String(SEARCH_RESULTS_MAX),
      });
      return buildRequest(`${lookupPath}?${searchParams}`, credential);
    },
  );
}

function toSearchHit(siteSubtitle) {
  const languageCode = fromSiteLanguageCode(siteSubtitle?.language);
  if (
    languageCode === null ||
    !isSiteFileId(siteSubtitle.id) ||
    !isSupportedSubtitleSourceFormat(siteSubtitle.format)
  ) {
    return null;
  }
  return {
    subtitleSource: SubtitleSource.THESUBTITLEDB,
    siteFileId: String(siteSubtitle.id),
    languageCode,
    releaseNames: toHitReleaseNames(
      (siteSubtitle.release_name ?? '').split(RELEASE_NAME_SEPARATOR_PATTERN),
    ),
    fileExtension: toHitFileExtension(siteSubtitle.format),
    isSitePack: false,
    isHearingImpaired: siteSubtitle.hearing_impaired ?? null,
    isForced: null,
    isMachineTranslated:
      MACHINE_TRANSLATED_BY_AI_KIND.get(siteSubtitle.ai ?? null) ?? null,
    isUploaderTrusted: null,
    isQuotaCostly: true,
    siteDownloadCount: null,
    siteFps: siteSubtitle.fps ?? null,
    siteFileUrl: null,
    siteCueCount: siteSubtitle.cues ?? null,
    siteDurationMs: isNil(siteSubtitle.duration_s)
      ? null
      : Math.round(siteSubtitle.duration_s * 1000),
    hashMatchVideoHashes: [],
    subtitleAliases: [],
  };
}

function toSearchHits({status, body}) {
  if (status === StatusCodes.NOT_FOUND) {
    return [];
  }
  return requireSubtitleSourceList(body?.subtitles?.items, {
    subtitleSource: SubtitleSource.THESUBTITLEDB,
  })
    .map(toSearchHit)
    .filter(Boolean);
}

function buildDownloadRequest({siteFileId}, credential) {
  return buildRequest(`/get/${encodeURIComponent(siteFileId)}`, credential, {
    responseType: 'bytes',
  });
}

function toDownload(response) {
  if (response.status === StatusCodes.NOT_FOUND) {
    throw toStatusError(response);
  }
  return {
    fileBytes: response.body,
    fileNameHint: readSubtitleSourceFileName(response.headers),
    extractedEntryPath: null,
  };
}

function buildCredentialCheckRequest(credential) {
  return buildRequest(
    `/v1/by-imdb/${CREDENTIAL_CHECK_IMDB_ID}?limit=1`,
    credential,
    {
      responseType: 'text',
      acceptedStatuses: [...CREDENTIAL_STATUS_BY_STATUS.keys()],
    },
  );
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

export const thesubtitledbMapping = {
  buildSearchRequests,
  toSearchHits,
  buildDownloadRequest,
  toDownload,
  buildCredentialCheckRequest,
  toCredentialCheck,
};
