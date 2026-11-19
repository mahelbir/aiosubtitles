import {isNil, isString, pickBy} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {VideoType} from '@repo/shared/constants/video-type.js';
import {toSubtitleLanguageCode} from '@repo/shared/lib/subtitle-language.js';
import {SubtitleFileExtension} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {
  SiteLanguageCodeStyle,
  toSiteLanguageCodes,
} from '../site-language-codes.js';
import {
  toHitReleaseNames,
  toNullableBoolean,
} from '../subtitle-source-contract.js';
import {SourceUnavailableError} from '../subtitle-source-errors.js';
import {
  isSubtitleSourceHtmlResponse,
  readSubtitleSourceErrorBody,
  readSubtitleSourceFileName,
  requireSubtitleSourceList,
  throwIfErrorBodyResponse,
  toSubtitleSourceStatusError,
} from '../subtitle-source-request.js';

const SUBDL_API_URL = 'https://api.subdl.com';
const SUBDL_DOWNLOAD_URL = 'https://dl.subdl.com';
const SUBTITLES_PAGE_LIMIT = 30;
const SITE_FILE_PATH_PATTERN = /^\/subtitle\/(\d+-\d+)\.zip$/;
const ISO_SITE_LANGUAGE_PATTERN = /^[A-Z]{2}$/;
const NO_RESULT_ERROR_PATTERN = /can['’]t find/i;
const SUBDL_LANGUAGE_CODES = new Map([
  ['BR_PT', SubtitleLanguage.POB],
  ['ZH_BG', SubtitleLanguage.ZHO],
]);
const CREDENTIAL_STATUS_BY_STATUS = new Map([
  [StatusCodes.UNAUTHORIZED, CredentialStatus.INVALID],
  [StatusCodes.FORBIDDEN, CredentialStatus.INVALID],
]);

function toLanguageCode(siteLanguage) {
  if (!isString(siteLanguage)) {
    return null;
  }
  const siteLanguageCode = siteLanguage.trim().toUpperCase();
  if (SUBDL_LANGUAGE_CODES.has(siteLanguageCode)) {
    return SUBDL_LANGUAGE_CODES.get(siteLanguageCode);
  }
  return ISO_SITE_LANGUAGE_PATTERN.test(siteLanguageCode)
    ? toSubtitleLanguageCode(siteLanguageCode)
    : null;
}

function toSubdlLanguageCodes(languageCodes) {
  return toSiteLanguageCodes(
    languageCodes,
    SiteLanguageCodeStyle.TWO_LETTER,
    SUBDL_LANGUAGE_CODES,
  ).map(siteLanguageCode => siteLanguageCode.toUpperCase());
}

function buildRequest(siteUrl, searchParams, requestOptions) {
  const requestUrl = new URL(siteUrl);
  requestUrl.search = new URLSearchParams(searchParams).toString();
  return {
    subtitleSource: SubtitleSource.SUBDL,
    url: requestUrl.href,
    method: 'GET',
    headers: {},
    responseType: 'json',
    acceptedStatuses: [],
    credentialId: null,
    ...requestOptions,
  };
}

function buildSearchRequest(searchQuery, credential) {
  const siteLanguageCodes = toSubdlLanguageCodes(searchQuery.languageCodes);
  if (!credential || !searchQuery.imdbId || siteLanguageCodes.length === 0) {
    return null;
  }
  const isMovieQuery = searchQuery.videoType === VideoType.MOVIE;
  return buildRequest(
    `${SUBDL_API_URL}/api/v1/subtitles`,
    {
      api_key: credential.apiKey,
      imdb_id: searchQuery.imdbId,
      type: isMovieQuery ? 'movie' : 'tv',
      ...(isMovieQuery
        ? {}
        : pickBy(
            {
              season_number: searchQuery.catalogSeason,
              episode_number: searchQuery.catalogEpisode,
            },
            catalogNumber => !isNil(catalogNumber),
          )),
      languages: siteLanguageCodes.join(','),
      subs_per_page: String(SUBTITLES_PAGE_LIMIT),
      releases: '1',
    },
    {credentialId: credential.credentialId},
  );
}

function toSiteFileUrl(siteFileId) {
  return new URL(
    `/subtitle/${encodeURIComponent(siteFileId)}.zip`,
    SUBDL_DOWNLOAD_URL,
  ).href;
}

function toSiteFileId(siteUrl) {
  const sitePath = isString(siteUrl)
    ? URL.parse(siteUrl, SUBDL_DOWNLOAD_URL)?.pathname
    : null;
  return sitePath?.match(SITE_FILE_PATH_PATTERN)?.[1] ?? null;
}

function toSearchHit(siteSubtitle) {
  const siteFileId = toSiteFileId(siteSubtitle?.url);
  const languageCode = toLanguageCode(siteSubtitle?.language);
  if (siteFileId === null || languageCode === null) {
    return null;
  }
  return {
    subtitleSource: SubtitleSource.SUBDL,
    siteFileId,
    languageCode,
    releaseNames: toHitReleaseNames(
      [
        siteSubtitle.release_name,
        ...(Array.isArray(siteSubtitle.releases) ? siteSubtitle.releases : []),
      ].filter(isString),
    ),
    fileExtension: SubtitleFileExtension.SRT,
    isSitePack: siteSubtitle.full_season === true,
    isHearingImpaired: toNullableBoolean(siteSubtitle.hi),
    isForced: null,
    isMachineTranslated: null,
    isUploaderTrusted: null,
    isQuotaCostly: true,
    siteDownloadCount: null,
    siteFps: Math.max(Number(siteSubtitle.fps), 0) || null,
    siteFileUrl: toSiteFileUrl(siteFileId),
    siteCueCount: null,
    siteDurationMs: null,
    hashMatchVideoHashes: [],
    subtitleAliases: [],
  };
}

function toSearchHits({status, body}) {
  if (status === StatusCodes.NOT_FOUND) {
    return [];
  }
  if (body?.status === false) {
    if (NO_RESULT_ERROR_PATTERN.test(String(body.error ?? ''))) {
      return [];
    }
    throw new SourceUnavailableError({
      subtitleSource: SubtitleSource.SUBDL,
      cause: new Error('The site refused the search.'),
    });
  }
  return requireSubtitleSourceList(body?.subtitles, {
    subtitleSource: SubtitleSource.SUBDL,
  })
    .map(toSearchHit)
    .filter(Boolean);
}

function buildDownloadRequest({siteFileId}, credential) {
  if (!credential) {
    throw new SourceUnavailableError({
      subtitleSource: SubtitleSource.SUBDL,
      cause: new Error('A download needs the user key.'),
    });
  }
  return buildRequest(
    toSiteFileUrl(siteFileId),
    {},
    {
      headers: {'x-api-key': credential.apiKey},
      responseType: 'bytes',
      credentialId: credential.credentialId,
    },
  );
}

function toDownload(response) {
  if (response.status === StatusCodes.NOT_FOUND) {
    throw toSubtitleSourceStatusError(response, {
      subtitleSource: SubtitleSource.SUBDL,
    });
  }
  throwIfErrorBodyResponse(response, {subtitleSource: SubtitleSource.SUBDL});
  return {
    fileBytes: response.body,
    fileNameHint: readSubtitleSourceFileName(response.headers),
    extractedEntryPath: null,
  };
}

function buildCredentialCheckRequest(credential) {
  return buildRequest(
    `${SUBDL_API_URL}/api/v1/me`,
    {api_key: credential.apiKey},
    {
      responseType: 'text',
      acceptedStatuses: [...CREDENTIAL_STATUS_BY_STATUS.keys()],
      credentialId: credential.credentialId,
    },
  );
}

function isRefusedAccountAnswer(response) {
  return (
    response.status < StatusCodes.MULTIPLE_CHOICES &&
    (isSubtitleSourceHtmlResponse(response.headers) ||
      readSubtitleSourceErrorBody(response).bodyJson?.status === false)
  );
}

function toCredentialCheck(response) {
  if (response.status === StatusCodes.NOT_FOUND) {
    throw toSubtitleSourceStatusError(response, {
      subtitleSource: SubtitleSource.SUBDL,
    });
  }
  if (isRefusedAccountAnswer(response)) {
    throw new SourceUnavailableError({
      subtitleSource: SubtitleSource.SUBDL,
      cause: new Error('No account answer.'),
    });
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

export const subdlMapping = {
  buildSearchRequest,
  toSearchHits,
  buildDownloadRequest,
  toDownload,
  buildCredentialCheckRequest,
  toCredentialCheck,
};
