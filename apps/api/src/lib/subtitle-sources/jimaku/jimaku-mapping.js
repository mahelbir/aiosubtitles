import path from 'node:path';
import {isNil, isString} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {ARCHIVE_FILE_EXTENSIONS} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {parseReleaseName} from '@repo/subtitle-core/release-name/parse-release-name.js';
import {
  isSupportedSubtitleSourceFormat,
  toHitFileExtension,
  toHitReleaseNames,
  toHitSiteFileId,
} from '../subtitle-source-contract.js';
import {
  SourceRateLimitError,
  SourceUnavailableError,
} from '../subtitle-source-errors.js';
import {
  SUBTITLE_SOURCE_RETRY_AFTER_MAX,
  parseSiteFileUrl,
  throwIfErrorBodyResponse,
  toSubtitleSourceStatusError,
} from '../subtitle-source-request.js';

const JIMAKU_URL = 'https://jimaku.cc';
const JIMAKU_HOSTNAME = new URL(JIMAKU_URL).hostname;
const ENTRIES_MAX = 3;
const CREDENTIAL_CHECK_ANILIST_ID = 1;
const FILE_PATH_PATTERN = /^\/entry\/(\d+)\/download\/([^/]+)$/;
const SITE_FILE_ID_PATTERN = /^(\d+)\/(.+)$/;
const RESET_AFTER_HEADER_NAME = 'x-ratelimit-reset-after';

function buildRequest(sitePath, searchParams, credential, requestOptions) {
  const requestUrl = new URL(sitePath, JIMAKU_URL);
  requestUrl.search = new URLSearchParams(searchParams).toString();
  return {
    subtitleSource: SubtitleSource.JIMAKU,
    url: requestUrl.href,
    method: 'GET',
    headers: {Authorization: credential.apiKey},
    responseType: 'json',
    acceptedStatuses: [StatusCodes.TOO_MANY_REQUESTS],
    credentialId: credential.credentialId,
    ...requestOptions,
  };
}

function readRetryAfterMs(headers) {
  const resetAfterSeconds = Number.parseFloat(
    headers?.[RESET_AFTER_HEADER_NAME],
  );
  return Number.isFinite(resetAfterSeconds) && resetAfterSeconds > 0
    ? Math.min(
        Math.ceil(resetAfterSeconds * 1000),
        SUBTITLE_SOURCE_RETRY_AFTER_MAX,
      )
    : null;
}

function throwIfAddressRateLimited(response) {
  if (response.status !== StatusCodes.TOO_MANY_REQUESTS) {
    return;
  }
  const retryAfterMs = readRetryAfterMs(response.headers);
  throw retryAfterMs === null
    ? toSubtitleSourceStatusError(response, {
        subtitleSource: SubtitleSource.JIMAKU,
      })
    : new SourceRateLimitError({
        subtitleSource: SubtitleSource.JIMAKU,
        retryAfterMs,
      });
}

function toSiteError(causeText) {
  return new SourceUnavailableError({
    subtitleSource: SubtitleSource.JIMAKU,
    cause: new Error(causeText),
  });
}

function readListBody(response, causeText) {
  throwIfAddressRateLimited(response);
  const {status, body} = response;
  if (status === StatusCodes.NOT_FOUND) {
    return [];
  }
  if (!Array.isArray(body)) {
    throw toSiteError(causeText);
  }
  return body;
}

function toSearchTarget({kitsuId, kitsuEpisode}, credential) {
  if (!credential || isNil(kitsuId)) {
    return null;
  }
  return {kitsuId, kitsuEpisode: kitsuEpisode ?? null};
}

function buildEntrySearchRequest(anilistId, credential) {
  return buildRequest(
    '/api/entries/search',
    {anilist_id: String(anilistId)},
    credential,
  );
}

function toEntryIds(response) {
  return readListBody(response, 'Entry search answer is not a list.')
    .map(siteEntry => siteEntry?.id)
    .filter(entryId => Number.isSafeInteger(entryId) && entryId >= 0)
    .slice(0, ENTRIES_MAX);
}

function buildFileListRequest(entryId, kitsuEpisode, credential) {
  return buildRequest(
    `/api/entries/${entryId}/files`,
    isNil(kitsuEpisode) ? {} : {episode: String(kitsuEpisode)},
    credential,
  );
}

function toFileUrl(entryId, fileName) {
  return new URL(
    `/entry/${entryId}/download/${encodeURIComponent(fileName)}`,
    JIMAKU_URL,
  ).href;
}

function readFileLink(siteUrl) {
  const pathMatch = parseSiteFileUrl(siteUrl, {
    isSiteHostname: hostname => hostname === JIMAKU_HOSTNAME,
    baseUrl: JIMAKU_URL,
  })?.pathname.match(FILE_PATH_PATTERN);
  if (!pathMatch) {
    return null;
  }
  try {
    return {entryId: pathMatch[1], fileName: decodeURIComponent(pathMatch[2])};
  } catch {
    return null;
  }
}

function readFileExtension(fileName) {
  return path.extname(fileName).slice(1).toLowerCase();
}

function isSupportedFileExtension(fileExtension) {
  return fileExtension !== '' && isSupportedSubtitleSourceFormat(fileExtension);
}

function isEpisodePack(fileName, kitsuEpisode) {
  if (isNil(kitsuEpisode)) {
    return false;
  }
  const {episodeNumbers, isSeasonPack} = parseReleaseName(fileName);
  return (
    isSeasonPack ||
    episodeNumbers.length !== 1 ||
    episodeNumbers[0] !== kitsuEpisode
  );
}

function toSearchHit(siteFile, kitsuEpisode) {
  const fileLink = readFileLink(siteFile?.url);
  if (fileLink === null) {
    return null;
  }
  const {entryId, fileName} = fileLink;
  const fileExtension = readFileExtension(fileName);
  const siteFileId = toHitSiteFileId(`${entryId}/${fileName}`);
  if (siteFileId === null || !isSupportedFileExtension(fileExtension)) {
    return null;
  }
  const isArchive = ARCHIVE_FILE_EXTENSIONS.has(fileExtension);
  return {
    subtitleSource: SubtitleSource.JIMAKU,
    siteFileId,
    languageCode: SubtitleLanguage.JPN,
    releaseNames: toHitReleaseNames([fileName]),
    fileExtension: toHitFileExtension(fileName),
    isSitePack: isArchive && isEpisodePack(fileName, kitsuEpisode),
    isHearingImpaired: null,
    isForced: null,
    isMachineTranslated: null,
    isUploaderTrusted: null,
    isQuotaCostly: false,
    siteDownloadCount: null,
    siteFps: null,
    siteFileUrl: toFileUrl(entryId, fileName),
    siteCueCount: null,
    siteDurationMs: null,
    hashMatchVideoHashes: [],
    subtitleAliases: [],
  };
}

function toSearchHits(response, kitsuEpisode) {
  return readListBody(response, 'File list answer is not a list.')
    .map(siteFile => toSearchHit(siteFile, kitsuEpisode))
    .filter(Boolean);
}

function readSiteFileId(siteFileId) {
  const fileMatch = isString(siteFileId)
    ? siteFileId.match(SITE_FILE_ID_PATTERN)
    : null;
  if (!fileMatch) {
    throw toSiteError('The file id names no entry.');
  }
  return {entryId: fileMatch[1], fileName: fileMatch[2]};
}

function buildDownloadRequest({siteFileId}) {
  const {entryId, fileName} = readSiteFileId(siteFileId);
  return {
    subtitleSource: SubtitleSource.JIMAKU,
    url: toFileUrl(entryId, fileName),
    method: 'GET',
    headers: {},
    responseType: 'bytes',
    acceptedStatuses: [StatusCodes.TOO_MANY_REQUESTS],
    credentialId: null,
  };
}

function toDownload(response, {siteFileId}) {
  throwIfAddressRateLimited(response);
  if (response.status === StatusCodes.NOT_FOUND) {
    throw toSubtitleSourceStatusError(response, {
      subtitleSource: SubtitleSource.JIMAKU,
    });
  }
  throwIfErrorBodyResponse(response, {subtitleSource: SubtitleSource.JIMAKU});
  return {
    fileBytes: response.body,
    fileNameHint: readSiteFileId(siteFileId).fileName,
    extractedEntryPath: null,
  };
}

function buildCredentialCheckRequest(credential) {
  return buildEntrySearchRequest(CREDENTIAL_CHECK_ANILIST_ID, credential);
}

function toCredentialCheck(response) {
  throwIfAddressRateLimited(response);
  if (response.status === StatusCodes.NOT_FOUND) {
    throw toSubtitleSourceStatusError(response, {
      subtitleSource: SubtitleSource.JIMAKU,
    });
  }
  readListBody(response, 'Key check answer is not a list.');
  return {
    credentialStatus: CredentialStatus.VALID,
    quotaRemainingCount: null,
    quotaAllowedCount: null,
    quotaResetAt: null,
  };
}

export const jimakuMapping = {
  toSearchTarget,
  buildEntrySearchRequest,
  toEntryIds,
  buildFileListRequest,
  toSearchHits,
  buildDownloadRequest,
  toDownload,
  buildCredentialCheckRequest,
  toCredentialCheck,
};
