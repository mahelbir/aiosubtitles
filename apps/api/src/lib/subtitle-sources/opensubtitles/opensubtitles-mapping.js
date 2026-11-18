import {isNil} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {VideoType} from '@repo/shared/constants/video-type.js';
import {dropFileExtension} from '@repo/subtitle-core/release-name/name-tokens.js';
import {
  SiteLanguageCodeStyle,
  fromSiteLanguageCode,
  toSiteLanguageCodes,
} from '../site-language-codes.js';
import {SubtitleAliasSource} from '../subtitle-alias-source.js';
import {
  toHitFileExtension,
  toHitReleaseNames,
  toNullableBoolean,
} from '../subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceRateLimitError,
  SourceUnavailableError,
} from '../subtitle-source-errors.js';
import {
  SUBTITLE_SOURCE_RETRY_AFTER_DEFAULT,
  SUBTITLE_SOURCE_RETRY_AFTER_MAX,
  isPrivateSubtitleSourceUrl,
  readSubtitleSourceFileName,
  toSubtitleSourceStatusError,
} from '../subtitle-source-request.js';

export const OPENSUBTITLES_API_URL = 'https://api.opensubtitles.com/api/v1';
const API_PATH = '/api/v1';
const IMDB_ID_PATTERN = /^tt(\d+)$/i;
const INVALID_TOKEN_PATTERN = /invalid token/i;
const INVALID_PATTERN = /invalid/i;
const SITE_URL_PROTOCOLS = new Set(['http:', 'https:']);
const SITE_HOSTNAME = 'opensubtitles.com';
const SPENT_QUOTA_REMAINING = -1;
const CREDENTIAL_REJECTED_STATUSES = [
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
];
const LOGIN_ACCEPTED_STATUSES = [StatusCodes.FORBIDDEN];
export const DOWNLOAD_ACCEPTED_STATUSES = [
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_ACCEPTABLE,
  StatusCodes.INTERNAL_SERVER_ERROR,
];
const QUOTA_ACCEPTED_STATUSES = [
  StatusCodes.FORBIDDEN,
  StatusCodes.INTERNAL_SERVER_ERROR,
];
const TOKEN_REJECTION_PATTERNS = new Map([
  [StatusCodes.NOT_ACCEPTABLE, INVALID_TOKEN_PATTERN],
  [StatusCodes.INTERNAL_SERVER_ERROR, INVALID_PATTERN],
]);

function isSuccessStatus(status) {
  return status >= StatusCodes.OK && status < StatusCodes.MULTIPLE_CHOICES;
}

function isTokenRejected({status, body}) {
  if (status === StatusCodes.UNAUTHORIZED) {
    return true;
  }
  const messagePattern = TOKEN_REJECTION_PATTERNS.get(status);
  return (
    messagePattern !== undefined &&
    typeof body?.message === 'string' &&
    messagePattern.test(body.message)
  );
}

function toTokenRejectedError(credentialId) {
  return new SourceCredentialError({
    subtitleSource: SubtitleSource.OPENSUBTITLES,
    credentialId,
  });
}

function isSiteFileId(siteFileId) {
  return Number.isSafeInteger(siteFileId) && siteFileId > 0;
}

function toCount(siteCount) {
  return Number.isSafeInteger(siteCount) && siteCount >= 0 ? siteCount : null;
}

function toUnavailableError(reason) {
  return new SourceUnavailableError({
    subtitleSource: SubtitleSource.OPENSUBTITLES,
    cause: new Error(reason),
  });
}

function throwUnlessSuccess(response, credentialId = null) {
  if (response.status === StatusCodes.FORBIDDEN) {
    throw toUnavailableError(`Status ${StatusCodes.FORBIDDEN}.`);
  }
  if (!isSuccessStatus(response.status)) {
    throw toSubtitleSourceStatusError(response, {
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      credentialId,
    });
  }
}

function toSiteUrl(siteUrlText) {
  if (typeof siteUrlText !== 'string' || !URL.canParse(siteUrlText)) {
    throw toUnavailableError('Malformed site url.');
  }
  const siteUrl = new URL(siteUrlText);
  if (
    !SITE_URL_PROTOCOLS.has(siteUrl.protocol) ||
    isPrivateSubtitleSourceUrl(siteUrl)
  ) {
    throw toUnavailableError('Refused site url.');
  }
  return siteUrl;
}

function buildRequest(siteUrl, {apiKey, credentialId = null, session}) {
  return {
    subtitleSource: SubtitleSource.OPENSUBTITLES,
    url: siteUrl,
    method: 'GET',
    headers: {
      'Api-Key': apiKey,
      ...(session ? {Authorization: `Bearer ${session.token}`} : {}),
    },
    responseType: 'json',
    acceptedStatuses: [],
    credentialId,
  };
}

function findSearchKey(credential, apiKey) {
  if (
    credential?.credentialKind === CredentialKind.API_KEY &&
    credential.apiKey
  ) {
    return {apiKey: credential.apiKey, credentialId: credential.credentialId};
  }
  return apiKey ? {apiKey, credentialId: null} : null;
}

function buildTitleParameters({
  videoType,
  imdbId,
  catalogSeason,
  catalogEpisode,
}) {
  const imdbNumber = imdbId?.match(IMDB_ID_PATTERN)?.[1];
  if (!imdbNumber) {
    return null;
  }
  const imdbIdParameter = String(Number(imdbNumber));
  if (videoType === VideoType.MOVIE) {
    return {imdb_id: imdbIdParameter};
  }
  if (isNil(catalogSeason) || isNil(catalogEpisode)) {
    return null;
  }
  return {
    parent_imdb_id: imdbIdParameter,
    season_number: String(catalogSeason),
    episode_number: String(catalogEpisode),
  };
}

function toQueryText(searchParameters) {
  return Object.entries(searchParameters)
    .toSorted(([leftName], [rightName]) => leftName.localeCompare(rightName))
    .map(
      ([parameterName, parameterValue]) =>
        `${parameterName}=${encodeURIComponent(parameterValue.toLowerCase()).replaceAll('%2C', ',')}`,
    )
    .join('&');
}

function buildSearchRequest(searchQuery, {credential, apiKey}) {
  const searchKey = findSearchKey(credential, apiKey);
  const titleParameters = buildTitleParameters(searchQuery);
  const siteLanguageCodes = toSiteLanguageCodes(
    searchQuery.languageCodes,
    SiteLanguageCodeStyle.LOCALE,
  ).toSorted();
  if (
    searchKey === null ||
    titleParameters === null ||
    siteLanguageCodes.length === 0
  ) {
    return null;
  }
  const queryText = toQueryText({
    ...titleParameters,
    languages: siteLanguageCodes.join(','),
    ...(searchQuery.videoHash ? {moviehash: searchQuery.videoHash} : {}),
  });
  return buildRequest(
    `${OPENSUBTITLES_API_URL}/subtitles?${queryText}`,
    searchKey,
  );
}

function toSubtitleAliases(legacySubtitleId) {
  if (!isSiteFileId(legacySubtitleId)) {
    return [];
  }
  return [
    SubtitleAliasSource.OPENSUBTITLES_LEGACY,
    SubtitleAliasSource.OPENSUBTITLES_V3,
  ].map(aliasSource => ({
    aliasSource,
    aliasSiteFileId: String(legacySubtitleId),
  }));
}

function toSearchHit(siteSubtitle, {videoHash}) {
  const siteAttributes = siteSubtitle?.attributes;
  const siteFiles = siteAttributes?.files;
  const languageCode = fromSiteLanguageCode(siteAttributes?.language);
  if (
    languageCode === null ||
    !Array.isArray(siteFiles) ||
    siteFiles.length !== 1 ||
    !isSiteFileId(siteFiles[0]?.file_id)
  ) {
    return null;
  }
  const [{file_id: siteFileId, file_name: siteFileName}] = siteFiles;
  const fileName = typeof siteFileName === 'string' ? siteFileName : '';
  const isMachineTranslated = [
    siteAttributes.machine_translated,
    siteAttributes.ai_translated,
  ].some(Boolean);
  return {
    subtitleSource: SubtitleSource.OPENSUBTITLES,
    siteFileId: String(siteFileId),
    languageCode,
    releaseNames: toHitReleaseNames([
      typeof siteAttributes.release === 'string' ? siteAttributes.release : '',
      dropFileExtension(fileName),
    ]),
    fileExtension: toHitFileExtension(fileName),
    isSitePack: false,
    isHearingImpaired: toNullableBoolean(siteAttributes.hearing_impaired),
    isForced: toNullableBoolean(siteAttributes.foreign_parts_only),
    isMachineTranslated,
    isUploaderTrusted: toNullableBoolean(siteAttributes.from_trusted),
    isQuotaCostly: true,
    siteDownloadCount: toCount(siteAttributes.download_count),
    siteFps:
      typeof siteAttributes.fps === 'number' && siteAttributes.fps > 0
        ? siteAttributes.fps
        : null,
    siteFileUrl: null,
    siteCueCount: null,
    siteDurationMs: null,
    hashMatchVideoHashes:
      siteAttributes.moviehash_match === true && videoHash
        ? [videoHash.toLowerCase()]
        : [],
    subtitleAliases: toSubtitleAliases(siteAttributes.legacy_subtitle_id),
  };
}

function toSearchHits({body}, searchQuery) {
  const siteSubtitles = body?.data;
  return Array.isArray(siteSubtitles)
    ? siteSubtitles
        .map(siteSubtitle => toSearchHit(siteSubtitle, searchQuery))
        .filter(Boolean)
    : [];
}

function buildLoginRequest(credential, {apiKey}) {
  return {
    ...buildRequest(`${OPENSUBTITLES_API_URL}/login`, {
      apiKey,
      credentialId: credential.credentialId,
    }),
    method: 'POST',
    body: {username: credential.username, password: credential.password},
    acceptedStatuses: LOGIN_ACCEPTED_STATUSES,
  };
}

function isSiteHostname(hostname) {
  return hostname === SITE_HOSTNAME || hostname.endsWith(`.${SITE_HOSTNAME}`);
}

function toBaseUrl(siteBaseUrl) {
  if (isNil(siteBaseUrl)) {
    return OPENSUBTITLES_API_URL;
  }
  const baseUrl = toSiteUrl(`https://${siteBaseUrl}${API_PATH}`);
  if (
    baseUrl.host !== String(siteBaseUrl).toLowerCase() ||
    !isSiteHostname(baseUrl.hostname)
  ) {
    throw toUnavailableError('Refused site url.');
  }
  return baseUrl.href;
}

function requireApiKey(apiKey) {
  if (!apiKey) {
    throw toUnavailableError('No server key.');
  }
  return apiKey;
}

function toSession(response, {credentialId = null} = {}) {
  throwUnlessSuccess(response, credentialId);
  const token = response.body?.token;
  if (typeof token !== 'string' || token === '') {
    throw toUnavailableError('Login gave no token.');
  }
  return {token, baseUrl: toBaseUrl(response.body.base_url)};
}

function requireAccountCredential(credential) {
  if (credential?.credentialKind !== CredentialKind.ACCOUNT) {
    throw new SourceCredentialError({
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      credentialId: null,
    });
  }
  return credential;
}

function buildDownloadRequest({siteFileId}, {credential, apiKey, session}) {
  return {
    ...buildRequest(`${session.baseUrl}/download`, {
      apiKey,
      credentialId: credential.credentialId,
      session,
    }),
    method: 'POST',
    body: {file_id: Number(siteFileId)},
    acceptedStatuses: DOWNLOAD_ACCEPTED_STATUSES,
  };
}

function toRetryAfterMs(resetTimeUtc) {
  const resetAtMs = Date.parse(resetTimeUtc);
  if (Number.isNaN(resetAtMs)) {
    return SUBTITLE_SOURCE_RETRY_AFTER_DEFAULT;
  }
  return Math.min(
    Math.max(0, resetAtMs - Date.now()),
    SUBTITLE_SOURCE_RETRY_AFTER_MAX,
  );
}

function isSpentQuotaResponse({status, body}) {
  return (
    status === StatusCodes.NOT_ACCEPTABLE &&
    body?.remaining === SPENT_QUOTA_REMAINING
  );
}

function toQuotaResetAt(resetTimeUtc) {
  const resetAtMs = Date.parse(resetTimeUtc);
  return Number.isNaN(resetAtMs) ? null : new Date(resetAtMs).toISOString();
}

function toQuotaReport(response) {
  if (isSpentQuotaResponse(response)) {
    return {
      quotaRemainingCount: 0,
      quotaResetAt: toQuotaResetAt(response.body.reset_time_utc),
    };
  }
  return {
    quotaRemainingCount: toCount(response.body?.remaining),
    quotaResetAt: toQuotaResetAt(response.body?.reset_time_utc),
  };
}

function throwUnlessTokenAccepted(response, credentialId) {
  if (isTokenRejected(response)) {
    throw toTokenRejectedError(credentialId);
  }
  throwUnlessSuccess(response);
}

function toDownloadLink(response, {credentialId}) {
  if (isSpentQuotaResponse(response)) {
    throw new SourceRateLimitError({
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      retryAfterMs: toRetryAfterMs(response.body.reset_time_utc),
      credentialId,
    });
  }
  throwUnlessTokenAccepted(response, credentialId);
  return {
    fileUrl: toSiteUrl(response.body?.link).href,
    fileNameHint:
      typeof response.body.file_name === 'string'
        ? response.body.file_name
        : null,
    ...toQuotaReport(response),
  };
}

function buildFileRequest({fileUrl}) {
  return {
    subtitleSource: SubtitleSource.OPENSUBTITLES,
    url: fileUrl,
    method: 'GET',
    headers: {},
    responseType: 'bytes',
    acceptedStatuses: [],
    credentialId: null,
  };
}

function toDownload(fileResponse, {fileNameHint}) {
  throwUnlessSuccess(fileResponse);
  return {
    fileBytes: fileResponse.body,
    fileNameHint:
      fileNameHint ?? readSubtitleSourceFileName(fileResponse.headers),
    extractedEntryPath: null,
  };
}

function buildQuotaRequest({credential, apiKey, session}) {
  return {
    ...buildRequest(`${session.baseUrl}/infos/user`, {
      apiKey,
      credentialId: credential.credentialId,
      session,
    }),
    acceptedStatuses: QUOTA_ACCEPTED_STATUSES,
  };
}

function toQuota(response, cachedQuota, {credentialId = null} = {}) {
  throwUnlessTokenAccepted(response, credentialId);
  const siteUser = response.body?.data;
  return {
    quotaRemainingCount: toCount(siteUser?.remaining_downloads),
    quotaAllowedCount: toCount(siteUser?.allowed_downloads),
    quotaResetAt: cachedQuota?.quotaResetAt ?? null,
  };
}

function toCredentialCheck(
  credentialStatus,
  {
    quotaRemainingCount = null,
    quotaAllowedCount = null,
    quotaResetAt = null,
  } = {},
) {
  return {
    credentialStatus,
    quotaRemainingCount,
    quotaAllowedCount,
    quotaResetAt,
  };
}

function toAccountCheck(quota) {
  return toCredentialCheck(
    quota.quotaRemainingCount === 0
      ? CredentialStatus.LIMITED
      : CredentialStatus.VALID,
    quota,
  );
}

function buildFormatsRequest(credential) {
  return {
    ...buildRequest(`${OPENSUBTITLES_API_URL}/infos/formats`, {
      apiKey: credential.apiKey,
      credentialId: credential.credentialId,
    }),
    responseType: 'text',
    acceptedStatuses: CREDENTIAL_REJECTED_STATUSES,
  };
}

function toApiKeyCheck(response) {
  if (CREDENTIAL_REJECTED_STATUSES.includes(response.status)) {
    return toCredentialCheck(CredentialStatus.INVALID);
  }
  throwUnlessSuccess(response);
  return toCredentialCheck(CredentialStatus.VALID);
}

export const opensubtitlesMapping = {
  buildSearchRequest,
  toSearchHits,
  buildLoginRequest,
  toSession,
  requireApiKey,
  requireAccountCredential,
  buildDownloadRequest,
  toQuotaReport,
  toDownloadLink,
  buildFileRequest,
  toDownload,
  buildQuotaRequest,
  toQuota,
  toCredentialCheck,
  toAccountCheck,
  buildFormatsRequest,
  toApiKeyCheck,
};
