import {compact, uniq} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {VideoType} from '@repo/shared/constants/video-type.js';
import {toSubtitleLanguageCode} from '@repo/shared/lib/subtitle-language.js';
import {dropCues} from '@repo/subtitle-core/file-format/drop-cues.js';
import {normalizeCueText} from '@repo/subtitle-core/file-format/normalize-cue-text.js';
import {
  parseStremioVideoId,
  VideoIdKind,
} from '../../video-catalog/parse-video-id.js';
import {fromSiteLanguageCode} from '../site-language-codes.js';
import {
  INTEGER_COLUMN_MAX,
  toHitFileExtension,
  toHitReleaseNames,
  toHitSiteFileId,
  toNullableBoolean,
  VIDEO_HASH_PATTERN,
} from '../subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceRateLimitError,
  SourceUnavailableError,
} from '../subtitle-source-errors.js';
import {
  isSubtitleSourceFileUrl,
  readSubtitleSourceFileName,
  SUBTITLE_SOURCE_RETRY_AFTER_DEFAULT,
  toSubtitleSourceStatusError,
} from '../subtitle-source-request.js';

const WYZIE_API_URL = 'https://sub.wyzie.io';
const SEARCH_PATH = '/search';
const SOURCES_PATH = '/sources';
const USAGE_PATH = '/usage';
const DEFAULT_CODENAMES = ['charlie', 'xray'];
const HEBREW_CODENAME = 'oscar';
const EXCLUDED_CODENAMES = new Set(['quebec', 'ai']);
const RECIPE_PARAM_NAMES = [
  'id',
  'kitsu',
  'season',
  'episode',
  'language',
  'source',
];
const SITE_FILE_ID_SEPARATOR = ':';
const FILE_PATH_PREFIX = '/c/';
const MACHINE_TRANSLATED_FLAG = 'machine_translated';
const HASH_MATCH_REASON = 'hash';
const REFUSAL_STATUSES = [StatusCodes.PAYMENT_REQUIRED, StatusCodes.FORBIDDEN];
const FREE_PLAN_PATTERN = /free plan/i;
const KEY_ON_HOLD_PATTERN = /on hold/i;
const WYZIE_LANGUAGE_CODES = new Map([[SubtitleLanguage.POB, 'pt-br']]);
const UPSELL_CUE_END_MS = 6000;
const UPSELL_TEXT_PATTERN = /you['’]re on the free plan/i;

function toWyzieLanguageCode(languageCode) {
  if (WYZIE_LANGUAGE_CODES.has(languageCode)) {
    return WYZIE_LANGUAGE_CODES.get(languageCode);
  }
  const iso6391 = SubtitleLanguage.raw(languageCode)?.iso6391;
  return iso6391 && toSubtitleLanguageCode(iso6391) === languageCode
    ? iso6391
    : null;
}

function toWyzieLanguageCodes(languageCodes) {
  return uniq(compact(languageCodes.map(toWyzieLanguageCode)));
}

function toSearchTarget({
  videoId,
  videoType,
  imdbId,
  catalogSeason,
  catalogEpisode,
}) {
  const parsedVideoId = parseStremioVideoId(videoId ?? '');
  if (parsedVideoId.videoIdKind === VideoIdKind.KITSU) {
    return {
      kitsu: parsedVideoId.kitsuId,
      ...(parsedVideoId.catalogEpisode === null
        ? {}
        : {episode: String(parsedVideoId.catalogEpisode)}),
    };
  }
  if (!imdbId) {
    return null;
  }
  if (videoType === VideoType.MOVIE) {
    return {id: imdbId};
  }
  if (!Number.isInteger(catalogSeason) || !Number.isInteger(catalogEpisode)) {
    return null;
  }
  return {
    id: imdbId,
    season: String(catalogSeason),
    episode: String(catalogEpisode),
  };
}

function toSiteUrl(sitePath, searchParams) {
  const siteUrl = new URL(sitePath, WYZIE_API_URL);
  siteUrl.search = new URLSearchParams(searchParams).toString();
  return siteUrl.href;
}

function buildRequest(siteUrl, credential, requestOptions = {}) {
  return {
    subtitleSource: SubtitleSource.WYZIE,
    url: siteUrl,
    method: 'GET',
    headers: {},
    responseType: 'json',
    acceptedStatuses: REFUSAL_STATUSES,
    credentialId: credential?.credentialId ?? null,
    ...requestOptions,
  };
}

function toUnavailableError(causeMessage) {
  return new SourceUnavailableError({
    subtitleSource: SubtitleSource.WYZIE,
    cause: new Error(causeMessage),
  });
}

function readRefusalBody(body) {
  if (body instanceof Uint8Array || typeof body === 'string') {
    try {
      return JSON.parse(
        typeof body === 'string' ? body : new TextDecoder().decode(body),
      );
    } catch {
      return null;
    }
  }
  return body;
}

function readRefusalMessage(body) {
  const message = readRefusalBody(body)?.message;
  return typeof message === 'string' ? message : '';
}

function isUnreadableRefusal({status, body}) {
  return status === StatusCodes.FORBIDDEN && readRefusalMessage(body) === '';
}

function isRefusal({status}) {
  return REFUSAL_STATUSES.includes(status);
}

function isFreePlanRefusal({status, body}) {
  return (
    status === StatusCodes.FORBIDDEN &&
    FREE_PLAN_PATTERN.test(readRefusalMessage(body))
  );
}

function isLimitRefusal({status, body}) {
  return (
    status === StatusCodes.PAYMENT_REQUIRED ||
    KEY_ON_HOLD_PATTERN.test(readRefusalMessage(body))
  );
}

function toRefusalError(response, credential) {
  if (isFreePlanRefusal(response)) {
    return toUnavailableError('Source outside the key plan.');
  }
  if (isLimitRefusal(response)) {
    return new SourceRateLimitError({
      subtitleSource: SubtitleSource.WYZIE,
      retryAfterMs: SUBTITLE_SOURCE_RETRY_AFTER_DEFAULT,
      credentialId: credential?.credentialId ?? null,
    });
  }
  if (isUnreadableRefusal(response)) {
    return toUnavailableError('Refusal without a Wyzie error body.');
  }
  return new SourceCredentialError({
    subtitleSource: SubtitleSource.WYZIE,
    credentialId: credential?.credentialId ?? null,
  });
}

function listSearchCodenames(searchQuery, availableCodenames) {
  const codenames = [
    ...DEFAULT_CODENAMES,
    ...(searchQuery.languageCodes.includes(SubtitleLanguage.HEB)
      ? [HEBREW_CODENAME]
      : []),
  ];
  return availableCodenames === null
    ? codenames
    : codenames.filter(codename => availableCodenames.includes(codename));
}

function buildSearchRequest(searchQuery, credential, codenames) {
  const searchTarget = toSearchTarget(searchQuery);
  const wyzieLanguageCodes = toWyzieLanguageCodes(searchQuery.languageCodes);
  if (
    !credential ||
    codenames.length === 0 ||
    searchTarget === null ||
    wyzieLanguageCodes.length === 0
  ) {
    return null;
  }
  return buildRequest(
    toSiteUrl(SEARCH_PATH, {
      ...searchTarget,
      language: wyzieLanguageCodes.join(','),
      source: codenames.join(','),
      key: credential.apiKey,
      ...(VIDEO_HASH_PATTERN.test(searchQuery.videoHash ?? '')
        ? {hash: searchQuery.videoHash}
        : {}),
    }),
    credential,
  );
}

function toSiteFileId(siteSubtitle) {
  const siteId = toHitSiteFileId(siteSubtitle?.id);
  return siteId === null
    ? null
    : toHitSiteFileId(
        `${siteSubtitle.source}${SITE_FILE_ID_SEPARATOR}${siteId}`,
      );
}

function isAskedRow(siteSubtitle, codenames) {
  return (
    siteSubtitle?.ai !== true &&
    typeof siteSubtitle?.source === 'string' &&
    codenames.includes(siteSubtitle.source) &&
    !EXCLUDED_CODENAMES.has(siteSubtitle.source)
  );
}

function toSiteDownloadCount(downloadCount) {
  return Number.isSafeInteger(downloadCount) &&
    downloadCount >= 0 &&
    downloadCount <= INTEGER_COLUMN_MAX
    ? downloadCount
    : null;
}

function toReleaseNames({releases, release, fileName}) {
  return toHitReleaseNames(
    [...(Array.isArray(releases) ? releases : []), release, fileName].filter(
      releaseName => typeof releaseName === 'string',
    ),
  );
}

function hasHashMatch(siteSubtitle, videoHash) {
  return (
    VIDEO_HASH_PATTERN.test(videoHash ?? '') &&
    Array.isArray(siteSubtitle.match?.reasons) &&
    siteSubtitle.match.reasons.includes(HASH_MATCH_REASON)
  );
}

function buildRecipeUrl(searchTarget, wyzieLanguageCode, codename) {
  return toSiteUrl(SEARCH_PATH, {
    ...searchTarget,
    language: wyzieLanguageCode,
    source: codename,
  });
}

function toSearchHit(siteSubtitle, {searchQuery, searchTarget}) {
  const siteFileId = toSiteFileId(siteSubtitle);
  const languageCode = fromSiteLanguageCode(siteSubtitle.language);
  const wyzieLanguageCode = languageCode && toWyzieLanguageCode(languageCode);
  if (siteFileId === null || !wyzieLanguageCode) {
    return null;
  }
  return {
    subtitleSource: SubtitleSource.WYZIE,
    siteFileId,
    languageCode,
    releaseNames: toReleaseNames(siteSubtitle),
    fileExtension: toHitFileExtension(siteSubtitle.format),
    isSitePack: false,
    isHearingImpaired: toNullableBoolean(siteSubtitle.isHearingImpaired),
    isForced: null,
    isMachineTranslated:
      Array.isArray(siteSubtitle.quality?.flags) &&
      siteSubtitle.quality.flags.includes(MACHINE_TRANSLATED_FLAG),
    isUploaderTrusted: null,
    isQuotaCostly: true,
    siteDownloadCount: toSiteDownloadCount(siteSubtitle.downloadCount),
    siteFps: null,
    siteFileUrl: buildRecipeUrl(
      searchTarget,
      wyzieLanguageCode,
      siteSubtitle.source,
    ),
    siteCueCount: null,
    siteDurationMs: null,
    hashMatchVideoHashes: hasHashMatch(siteSubtitle, searchQuery.videoHash)
      ? [searchQuery.videoHash]
      : [],
    subtitleAliases: [],
  };
}

function toSearchHits(response, {searchQuery, credential, codenames}) {
  if (
    response.status === StatusCodes.NOT_FOUND ||
    isFreePlanRefusal(response)
  ) {
    return [];
  }
  if (isRefusal(response)) {
    throw toRefusalError(response, credential);
  }
  const searchTarget = toSearchTarget(searchQuery);
  if (!Array.isArray(response.body) || searchTarget === null) {
    return [];
  }
  return compact(
    response.body
      .filter(siteSubtitle => isAskedRow(siteSubtitle, codenames))
      .map(siteSubtitle =>
        toSearchHit(siteSubtitle, {searchQuery, searchTarget}),
      ),
  );
}

function readRecipeParams(siteFileUrl) {
  if (typeof siteFileUrl !== 'string' || !URL.canParse(siteFileUrl)) {
    return null;
  }
  const recipeUrl = new URL(siteFileUrl);
  if (
    recipeUrl.origin !== WYZIE_API_URL ||
    recipeUrl.pathname !== SEARCH_PATH
  ) {
    return null;
  }
  return Object.fromEntries(
    RECIPE_PARAM_NAMES.filter(paramName =>
      recipeUrl.searchParams.has(paramName),
    ).map(paramName => [paramName, recipeUrl.searchParams.get(paramName)]),
  );
}

function buildDownloadSearchRequest({siteFileUrl}, credential) {
  const recipeParams = readRecipeParams(siteFileUrl);
  if (recipeParams === null || !credential) {
    throw toUnavailableError('No Wyzie search recipe.');
  }
  return buildRequest(
    toSiteUrl(SEARCH_PATH, {...recipeParams, key: credential.apiKey}),
    credential,
  );
}

function readRecipeLanguageCode({siteFileUrl}) {
  return fromSiteLanguageCode(readRecipeParams(siteFileUrl)?.language);
}

function isWyzieFileUrl(siteUrl) {
  if (typeof siteUrl !== 'string' || !isSubtitleSourceFileUrl(siteUrl)) {
    return false;
  }
  const fileUrl = new URL(siteUrl);
  return (
    fileUrl.origin === WYZIE_API_URL &&
    fileUrl.pathname.startsWith(FILE_PATH_PREFIX)
  );
}

function findDownloadUrl(response, {siteFileId}, {credential}) {
  if (isRefusal(response) && !isFreePlanRefusal(response)) {
    throw toRefusalError(response, credential);
  }
  const [codename] = siteFileId.split(SITE_FILE_ID_SEPARATOR);
  const siteSubtitle = Array.isArray(response.body)
    ? response.body.find(
        candidate =>
          isAskedRow(candidate, [codename]) &&
          toSiteFileId(candidate) === siteFileId,
      )
    : null;
  if (!isWyzieFileUrl(siteSubtitle?.url)) {
    throw toUnavailableError('Row missing from the Wyzie re-search.');
  }
  return siteSubtitle.url;
}

function buildDownloadRequest(downloadUrl, credential) {
  return buildRequest(downloadUrl, credential, {responseType: 'bytes'});
}

function toFileLinkError(error) {
  return error instanceof SourceCredentialError
    ? toUnavailableError('Wyzie refused the file link.')
    : error;
}

function isUpsellCue({startMs, text}) {
  return (
    startMs < UPSELL_CUE_END_MS &&
    UPSELL_TEXT_PATTERN.test(normalizeCueText(text))
  );
}

function dropUpsellCues(fileBytes, {languageCodeHint = null} = {}) {
  return dropCues({
    bytes: fileBytes,
    isCueDropped: isUpsellCue,
    languageCodeHint,
  });
}

function toDownload(response, credential, {languageCode = null} = {}) {
  if (isRefusal(response)) {
    throw toRefusalError(response, credential);
  }
  if (response.status === StatusCodes.NOT_FOUND) {
    throw toSubtitleSourceStatusError(response, {
      subtitleSource: SubtitleSource.WYZIE,
    });
  }
  return {
    fileBytes: dropUpsellCues(response.body, {languageCodeHint: languageCode}),
    fileNameHint: readSubtitleSourceFileName(response.headers),
    extractedEntryPath: null,
  };
}

function buildCredentialCheckRequest(credential) {
  return buildRequest(
    toSiteUrl(SOURCES_PATH, {key: credential.apiKey}),
    credential,
  );
}

function toKeyScope({body}) {
  const isKeyValid = body?.key?.valid;
  if (typeof isKeyValid !== 'boolean') {
    return {isKeyValid: null, availableCodenames: null};
  }
  return {
    isKeyValid,
    availableCodenames: Array.isArray(body.available)
      ? body.available.filter(codename => typeof codename === 'string')
      : null,
  };
}

function toCredentialCheck(response, credential) {
  if (isRefusal(response)) {
    throw toRefusalError(response, credential);
  }
  const {isKeyValid} = toKeyScope(response);
  if (isKeyValid === null) {
    throw toUnavailableError('Wyzie could not verify the key.');
  }
  return {
    credentialStatus: isKeyValid
      ? CredentialStatus.VALID
      : CredentialStatus.INVALID,
    quotaRemainingCount: null,
    quotaAllowedCount: null,
    quotaResetAt: null,
  };
}

function buildQuotaRequest(credential) {
  return buildRequest(
    toSiteUrl(USAGE_PATH, {key: credential.apiKey}),
    credential,
  );
}

function toQuotaCount(siteCount) {
  return Number.isSafeInteger(siteCount) && siteCount >= 0 ? siteCount : null;
}

function toQuotaResetAt(resetAtSeconds) {
  return Number.isFinite(resetAtSeconds)
    ? new Date(resetAtSeconds * 1000).toISOString()
    : null;
}

function toRefusalStatus(response) {
  if (isFreePlanRefusal(response) || isUnreadableRefusal(response)) {
    throw toRefusalError(response, null);
  }
  return isLimitRefusal(response)
    ? CredentialStatus.LIMITED
    : CredentialStatus.INVALID;
}

function toQuota(response) {
  if (isRefusal(response)) {
    return {
      credentialStatus: toRefusalStatus(response),
      quotaRemainingCount: null,
      quotaAllowedCount: null,
      quotaResetAt: null,
    };
  }
  const usage = response.body ?? {};
  return {
    credentialStatus:
      usage.held === true ? CredentialStatus.LIMITED : CredentialStatus.VALID,
    quotaRemainingCount: toQuotaCount(usage.balance),
    quotaAllowedCount: toQuotaCount(usage.daily_limit),
    quotaResetAt: toQuotaResetAt(usage.reset_at),
  };
}

export const wyzieMapping = {
  listSearchCodenames,
  buildSearchRequest,
  toSearchHits,
  buildDownloadSearchRequest,
  readRecipeLanguageCode,
  findDownloadUrl,
  buildDownloadRequest,
  toFileLinkError,
  dropUpsellCues,
  toDownload,
  buildCredentialCheckRequest,
  toKeyScope,
  toCredentialCheck,
  buildQuotaRequest,
  toQuota,
};
