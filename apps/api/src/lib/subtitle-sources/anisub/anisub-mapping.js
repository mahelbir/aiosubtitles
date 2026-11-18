import {isNil} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {z} from 'zod';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SubtitleFileExtension} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {fromSiteLanguageCode} from '../site-language-codes.js';
import {
  buildImdbVideoId,
  toHitReleaseNames,
  toHitSiteFileId,
} from '../subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceUnavailableError,
} from '../subtitle-source-errors.js';
import {
  isSubtitleSourceFileUrl,
  isSubtitleSourceJsonResponse,
  readSubtitleSourceFileName,
  readSubtitleSourceJson,
  toSubtitleSourceStatusError,
} from '../subtitle-source-request.js';

const ANISUB_URL = 'https://anisub.co';
const ANISUB_HOSTNAME = 'anisub.co';
const ANISUB_LOCALE = 'tr';
const JSON_MEDIA_TYPE = 'application/json';
const SITE_PACK_PATTERN = /\bPaket\b/;
const SITE_ID_PATH_PATTERNS = [
  /^\/api\/subtitles\/(\d+)\/download$/,
  /^\/altyazi\/(\d+)$/,
  /^\/stremio\/subtitle\/(\d+)$/,
];
const SITE_EPISODE_PATTERN = /^\d+$/;
const TOKEN_REJECTED_STATUSES = [
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
];
const ANISUB_LANGUAGE_WORDS = new Map([
  ['türkçe', SubtitleLanguage.TUR],
  ['turkce', SubtitleLanguage.TUR],
]);
const resetAtField = z.iso.datetime({offset: true});

function toStatusError(response) {
  return toSubtitleSourceStatusError(response, {
    subtitleSource: SubtitleSource.ANISUB,
  });
}

function toUnavailableError(reason) {
  return new SourceUnavailableError({
    subtitleSource: SubtitleSource.ANISUB,
    cause: new Error(reason),
  });
}

function buildRequest(url, requestOptions = {}) {
  return {
    subtitleSource: SubtitleSource.ANISUB,
    url,
    method: 'GET',
    headers: {},
    responseType: 'json',
    acceptedStatuses: [],
    credentialId: null,
    ...requestOptions,
  };
}

function buildTokenRequest(sitePath, credential, requestOptions = {}) {
  return buildRequest(`${ANISUB_URL}${sitePath}`, {
    headers: {
      Authorization: `Bearer ${credential.accessToken}`,
      Accept: JSON_MEDIA_TYPE,
    },
    credentialId: credential.credentialId,
    ...requestOptions,
  });
}

function toSiteText(siteValue) {
  return typeof siteValue === 'string' ? siteValue.trim() : '';
}

function fromAnisubLanguage(siteLanguage) {
  if (isNil(siteLanguage)) {
    return SubtitleLanguage.TUR;
  }
  if (typeof siteLanguage !== 'string') {
    return null;
  }
  const siteLanguageWord = siteLanguage.trim().toLocaleLowerCase(ANISUB_LOCALE);
  if (siteLanguageWord === '') {
    return SubtitleLanguage.TUR;
  }
  return (
    ANISUB_LANGUAGE_WORDS.get(siteLanguageWord) ??
    fromSiteLanguageCode(siteLanguage)
  );
}

function buildSearchRequest(searchQuery) {
  const imdbVideoId = buildImdbVideoId(searchQuery);
  if (
    imdbVideoId === null ||
    !searchQuery.languageCodes.includes(SubtitleLanguage.TUR)
  ) {
    return null;
  }
  return buildRequest(
    `${ANISUB_URL}/subtitles/${encodeURIComponent(searchQuery.videoType)}/${imdbVideoId}.json`,
  );
}

function toSearchHit(siteSubtitle, languageCodes) {
  const languageCode = fromAnisubLanguage(siteSubtitle?.lang);
  const siteFileId = toHitSiteFileId(siteSubtitle?.id);
  if (
    !languageCodes.has(languageCode) ||
    siteFileId === null ||
    !isSubtitleSourceFileUrl(siteSubtitle.url)
  ) {
    return null;
  }
  const label = toSiteText(siteSubtitle.label);
  const releaseInfo = toSiteText(siteSubtitle.releaseInfo);
  return {
    subtitleSource: SubtitleSource.ANISUB,
    siteFileId,
    languageCode,
    releaseNames: toHitReleaseNames([releaseInfo || label]),
    fileExtension: SubtitleFileExtension.SRT,
    isSitePack:
      SITE_PACK_PATTERN.test(label) || SITE_PACK_PATTERN.test(releaseInfo),
    isHearingImpaired: null,
    isForced: null,
    isMachineTranslated: null,
    isUploaderTrusted: null,
    isQuotaCostly: true,
    siteDownloadCount: null,
    siteFps: null,
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
  if (!isSubtitleSourceFileUrl(siteFileUrl)) {
    throw new SourceUnavailableError({
      subtitleSource: SubtitleSource.ANISUB,
      cause: new Error('No downloadable file url.'),
    });
  }
  return buildRequest(siteFileUrl, {responseType: 'bytes'});
}

function toDownload(response, fileNameHint = null) {
  if (response.status === StatusCodes.NOT_FOUND) {
    throw toStatusError(response);
  }
  if (isSubtitleSourceJsonResponse(response.headers)) {
    throw toUnavailableError('JSON answer in place of the file.');
  }
  return {
    fileBytes: response.body,
    fileNameHint: readSubtitleSourceFileName(response.headers) ?? fileNameHint,
    extractedEntryPath: null,
  };
}

function readSiteFileTarget(siteFileUrl) {
  if (typeof siteFileUrl !== 'string' || !URL.canParse(siteFileUrl)) {
    return null;
  }
  const {protocol, hostname, pathname, searchParams} = new URL(siteFileUrl);
  if (protocol !== 'https:' || hostname !== ANISUB_HOSTNAME) {
    return null;
  }
  const siteSubtitleId = SITE_ID_PATH_PATTERNS.map(
    sitePathPattern => sitePathPattern.exec(pathname)?.[1],
  ).find(Boolean);
  if (!siteSubtitleId) {
    return null;
  }
  const siteEpisode = searchParams.get('episode');
  return {
    siteSubtitleId,
    siteEpisode: SITE_EPISODE_PATTERN.test(siteEpisode ?? '')
      ? siteEpisode
      : null,
  };
}

function findDownloadEpisode(siteEpisode, {catalogEpisode, isSitePack}) {
  if (siteEpisode !== null) {
    return siteEpisode;
  }
  return isNil(catalogEpisode) || isSitePack === false
    ? null
    : String(catalogEpisode);
}

function buildIntegrationDownloadRequest(subtitleRef, credential) {
  const siteFileTarget = readSiteFileTarget(subtitleRef.siteFileUrl);
  if (siteFileTarget === null) {
    throw toUnavailableError(
      'AniSub token download needs a recognised file link.',
    );
  }
  const downloadEpisode = findDownloadEpisode(
    siteFileTarget.siteEpisode,
    subtitleRef,
  );
  const episodeQuery =
    downloadEpisode === null
      ? ''
      : `?${new URLSearchParams({episode: downloadEpisode})}`;
  return buildTokenRequest(
    `/api/integrations/subtitles/${siteFileTarget.siteSubtitleId}/download${episodeQuery}`,
    credential,
    {responseType: 'bytes', acceptedStatuses: TOKEN_REJECTED_STATUSES},
  );
}

function toDownloadLink(response, {credentialId}) {
  if (TOKEN_REJECTED_STATUSES.includes(response.status)) {
    throw new SourceCredentialError({
      subtitleSource: SubtitleSource.ANISUB,
      credentialId,
    });
  }
  return toFileDownloadLink(response);
}

function isAnisubFileUrl(siteFileUrl) {
  if (!isSubtitleSourceFileUrl(siteFileUrl)) {
    return false;
  }
  const {hostname} = new URL(siteFileUrl);
  return (
    hostname === ANISUB_HOSTNAME || hostname.endsWith(`.${ANISUB_HOSTNAME}`)
  );
}

function readDownloadLink(siteAnswer) {
  const downloadLink = siteAnswer?.success === true ? siteAnswer.data : null;
  if (!isAnisubFileUrl(downloadLink?.download_url)) {
    throw toUnavailableError('No downloadable file url.');
  }
  return {
    siteFileUrl: downloadLink.download_url,
    fileNameHint:
      typeof downloadLink.filename === 'string' ? downloadLink.filename : null,
  };
}

function toFileDownloadLink(response) {
  if (response.status === StatusCodes.NOT_FOUND) {
    throw toStatusError(response);
  }
  if (!isSubtitleSourceJsonResponse(response.headers)) {
    return null;
  }
  let siteAnswer;
  try {
    siteAnswer = readSubtitleSourceJson(response.body, response.headers);
  } catch {
    throw toUnavailableError('Malformed JSON answer.');
  }
  return readDownloadLink(siteAnswer);
}

function buildCredentialCheckRequest(credential) {
  return buildTokenRequest('/api/me', credential, {
    acceptedStatuses: [StatusCodes.UNAUTHORIZED],
  });
}

function toCredentialCheck(response) {
  if (response.status === StatusCodes.NOT_FOUND) {
    throw toStatusError(response);
  }
  const isRejected = response.status === StatusCodes.UNAUTHORIZED;
  if (!isRejected && response.body?.success !== true) {
    throw toUnavailableError('No profile in the answer.');
  }
  return {
    credentialStatus: isRejected
      ? CredentialStatus.INVALID
      : CredentialStatus.VALID,
    quotaRemainingCount: null,
    quotaAllowedCount: null,
    quotaResetAt: null,
  };
}

function buildQuotaRequest(credential) {
  return buildTokenRequest('/api/usage-stats', credential);
}

function toQuotaCount(siteCount) {
  return Number.isSafeInteger(siteCount) && siteCount >= 0 ? siteCount : null;
}

function toQuota(response) {
  if (response.status === StatusCodes.NOT_FOUND) {
    throw toStatusError(response);
  }
  const usageStats = response.body?.data;
  return {
    credentialStatus: CredentialStatus.VALID,
    quotaRemainingCount: toQuotaCount(usageStats?.remaining),
    quotaAllowedCount: toQuotaCount(usageStats?.limit),
    quotaResetAt: resetAtField.safeParse(usageStats?.resets_at).success
      ? usageStats.resets_at
      : null,
  };
}

export const anisubMapping = {
  buildSearchRequest,
  toSearchHits,
  buildDownloadRequest,
  toDownload,
  buildIntegrationDownloadRequest,
  toDownloadLink,
  buildCredentialCheckRequest,
  toCredentialCheck,
  buildQuotaRequest,
  toQuota,
};
