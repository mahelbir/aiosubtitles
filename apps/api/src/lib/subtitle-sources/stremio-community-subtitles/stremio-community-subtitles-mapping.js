import {isNil} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {fromSiteLanguageCode} from '../site-language-codes.js';
import {
  SITE_FILE_ID_LENGTH_MAX,
  toHitFileExtension,
  toHitReleaseNames,
} from '../subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceUnavailableError,
} from '../subtitle-source-errors.js';
import {
  readSubtitleSourceContentType,
  parseSiteFileUrl,
  readSubtitleSourceFileName,
  readSubtitleSourceErrorBody,
  readSubtitleSourceJson,
  requireSubtitleSourceList,
  toSubtitleSourceStatusError,
} from '../subtitle-source-request.js';

const SITE_URL = 'https://stremio-community-subtitles.top';
const SITE_HOSTNAME = 'stremio-community-subtitles.top';
const SITE_LANGUAGE_CODES = [
  'eng',
  'pol',
  'spa',
  'fra',
  'deu',
  'ita',
  'por',
  'pob',
  'rus',
  'jpn',
  'zho',
  'kor',
  'ara',
  'hin',
  'tur',
  'nld',
  'swe',
  'nor',
  'dan',
  'fin',
  'ces',
  'slk',
  'hun',
  'ron',
  'bul',
  'ell',
  'heb',
  'tha',
  'vie',
  'ind',
  'msa',
  'ukr',
  'srp',
  'hrv',
  'slv',
  'est',
  'lav',
  'lit',
  'fas',
  'pus',
  'urd',
  'ben',
  'mya',
  'cat',
  'eus',
  'epo',
  'mkd',
  'tel',
  'sqi',
  'sin',
  'mon',
];
const SITE_FILE_ID_PATTERN = /^[\w-]+\.(?:vtt|srt|ass|sub)$/;
const SITE_DOWNLOAD_PATH_PATTERN = /^\/[^/]+\/download\/([^/]+)$/;
const VIDEO_ID_PATTERN =
  /^[\w.-]*[A-Za-z\d][\w.-]*(?::[\w.-]*[A-Za-z\d][\w.-]*)*$/;
const SITE_STATUS_MESSAGES = new Map([
  [StatusCodes.BAD_REQUEST, 'Invalid download link.'],
  [StatusCodes.FORBIDDEN, 'Invalid Access Token'],
]);
const CREDENTIAL_CHECK_FILE_ID = 'aiosubtitles-check.vtt';
const PLACEHOLDER_SAMPLE_BYTES = 4096;
const PLACEHOLDER_PREFIX = 'SCS:';
const PLACEHOLDER_FALLBACK_TEXT =
  'An error occurred or subtitles need selection.';
const CUE_TIMING_SEPARATOR = '-->';
const CUE_BLOCK_PATTERN = /\r?\n\r?\n/;
const LINE_PATTERN = /\r?\n/;
const FILE_NAME_HINTS = new Map([
  ['text/vtt', 'subtitle.vtt'],
  ['text/x-ssa', 'subtitle.ass'],
  ['text/x-ass', 'subtitle.ass'],
  ['application/x-subrip', 'subtitle.srt'],
]);

const siteLanguageCodeByLanguageCode = new Map(
  SITE_LANGUAGE_CODES.map(siteLanguageCode => [
    fromSiteLanguageCode(siteLanguageCode),
    siteLanguageCode,
  ]),
);

function toUnavailableError(reason) {
  return new SourceUnavailableError({
    subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
    cause: new Error(reason),
  });
}

function readToken(credential) {
  const accessToken = credential?.accessToken;
  return typeof accessToken === 'string' && accessToken.trim() !== ''
    ? accessToken.trim()
    : null;
}

function buildTokenRequest(sitePath, credential, requestOptions = {}) {
  return {
    subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
    url: `${SITE_URL}/${encodeURIComponent(readToken(credential))}${sitePath}`,
    method: 'GET',
    headers: {},
    responseType: 'json',
    acceptedStatuses: [],
    credentialId: credential.credentialId,
    ...requestOptions,
  };
}

function isSiteFileId(siteFileId) {
  return (
    typeof siteFileId === 'string' &&
    siteFileId.length <= SITE_FILE_ID_LENGTH_MAX &&
    SITE_FILE_ID_PATTERN.test(siteFileId)
  );
}

function toExtras(searchQuery, siteLanguageCodes) {
  return [
    ['videoHash', searchQuery.videoHash],
    ['videoSize', searchQuery.videoSizeBytes],
    ['filename', searchQuery.videoFilename],
    ['langs', siteLanguageCodes.join(',')],
  ]
    .filter(([, extraValue]) => !isNil(extraValue) && extraValue !== '')
    .map(
      ([extraName, extraValue]) =>
        `${extraName}=${encodeURIComponent(String(extraValue))}`,
    )
    .join('&');
}

function buildSearchRequest(searchQuery, credential) {
  const {videoId, videoType, catalogEpisode, languageCodes} = searchQuery;
  const siteLanguageCodes = languageCodes
    .map(languageCode => siteLanguageCodeByLanguageCode.get(languageCode))
    .filter(Boolean);
  if (
    readToken(credential) === null ||
    siteLanguageCodes.length === 0 ||
    typeof videoId !== 'string' ||
    !VIDEO_ID_PATTERN.test(videoId) ||
    (videoType === 'series' && isNil(catalogEpisode))
  ) {
    return null;
  }
  return buildTokenRequest(
    `/subtitles/${encodeURIComponent(videoType)}/${videoId}/${toExtras(searchQuery, siteLanguageCodes)}.json`,
    credential,
    {responseType: 'bytes', acceptedStatuses: [StatusCodes.FORBIDDEN]},
  );
}

function readSiteFileId(siteFileUrl) {
  const fileUrl = parseSiteFileUrl(siteFileUrl, {
    isSiteHostname: hostname => hostname === SITE_HOSTNAME,
    isHttpAllowed: true,
  });
  const siteFileId = fileUrl
    ? SITE_DOWNLOAD_PATH_PATTERN.exec(fileUrl.pathname)?.[1]
    : null;
  return isSiteFileId(siteFileId) ? siteFileId : null;
}

function toSearchHit(siteSubtitle, askedLanguageCodes) {
  const languageCode = fromSiteLanguageCode(siteSubtitle?.lang);
  const siteFileId = readSiteFileId(siteSubtitle?.url);
  if (!askedLanguageCodes.has(languageCode) || siteFileId === null) {
    return null;
  }
  return {
    subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
    siteFileId,
    languageCode,
    releaseNames: toHitReleaseNames(
      typeof siteSubtitle.id === 'string' ? [siteSubtitle.id] : [],
    ),
    fileExtension: toHitFileExtension(siteFileId),
    isSitePack: false,
    isHearingImpaired: null,
    isForced: null,
    isMachineTranslated: null,
    isUploaderTrusted: null,
    isQuotaCostly: true,
    siteDownloadCount: null,
    siteFps: null,
    siteFileUrl: null,
    siteCueCount: null,
    siteDurationMs: null,
    hashMatchVideoHashes: [],
    subtitleAliases: [],
  };
}

function readSiteJson({headers, body}) {
  try {
    return readSubtitleSourceJson(body, headers);
  } catch {
    throw toUnavailableError('Answer is not JSON.');
  }
}

function toSearchHits(response, {languageCodes}, credential = null) {
  if (response.status === StatusCodes.FORBIDDEN) {
    throw toForbiddenError(response, credential);
  }
  if (response.status === StatusCodes.NOT_FOUND) {
    return [];
  }
  const siteSubtitles = requireSubtitleSourceList(
    readSiteJson(response)?.subtitles,
    {subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES},
  );
  const askedLanguageCodes = new Set(languageCodes);
  return siteSubtitles
    .map(siteSubtitle => toSearchHit(siteSubtitle, askedLanguageCodes))
    .filter(Boolean);
}

function buildDownloadRequest({siteFileId}, credential) {
  if (readToken(credential) === null) {
    throw toUnavailableError('A download needs the user token.');
  }
  if (!isSiteFileId(siteFileId)) {
    throw toUnavailableError('Not a download file id.');
  }
  return buildTokenRequest(`/download/${siteFileId}`, credential, {
    responseType: 'bytes',
    acceptedStatuses: [StatusCodes.FORBIDDEN],
  });
}

function readFirstCueText(fileBytes) {
  const fileText = new TextDecoder().decode(
    fileBytes.subarray(0, PLACEHOLDER_SAMPLE_BYTES),
  );
  const cueLines =
    fileText
      .split(CUE_BLOCK_PATTERN)
      .map(cueBlock => cueBlock.split(LINE_PATTERN))
      .find(blockLines =>
        blockLines.some(blockLine => blockLine.includes(CUE_TIMING_SEPARATOR)),
      ) ?? [];
  const timingIndex = cueLines.findIndex(cueLine =>
    cueLine.includes(CUE_TIMING_SEPARATOR),
  );
  return cueLines
    .slice(timingIndex + 1)
    .join('\n')
    .trim();
}

function isPlaceholder(fileBytes) {
  const firstCueText = readFirstCueText(fileBytes);
  return (
    firstCueText.startsWith(PLACEHOLDER_PREFIX) ||
    firstCueText === PLACEHOLDER_FALLBACK_TEXT
  );
}

function toFileNameHint(headers) {
  const mediaType = readSubtitleSourceContentType(headers)
    ?.split(';')[0]
    .trim()
    .toLowerCase();
  return (
    FILE_NAME_HINTS.get(mediaType) ??
    readSubtitleSourceFileName(headers) ??
    null
  );
}

function isSiteAnswer(response) {
  const siteMessage = SITE_STATUS_MESSAGES.get(response.status);
  return (
    Boolean(siteMessage) &&
    readSubtitleSourceErrorBody(response).bodyText.includes(siteMessage)
  );
}

function toForbiddenError(response, credential) {
  return isSiteAnswer(response)
    ? new SourceCredentialError({
        subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
        credentialId: credential?.credentialId ?? null,
      })
    : toUnavailableError(`Status ${response.status}.`);
}

function toDownload(response, credential = null) {
  if (response.status === StatusCodes.FORBIDDEN) {
    throw toForbiddenError(response, credential);
  }
  if (response.status === StatusCodes.NOT_FOUND) {
    throw toSubtitleSourceStatusError(response, {
      subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
    });
  }
  if (isPlaceholder(response.body)) {
    throw toUnavailableError('The site served a placeholder.');
  }
  return {
    fileBytes: response.body,
    fileNameHint: toFileNameHint(response.headers),
    extractedEntryPath: null,
  };
}

function buildCredentialCheckRequest(credential) {
  return buildTokenRequest(
    `/download/${CREDENTIAL_CHECK_FILE_ID}`,
    credential,
    {
      responseType: 'text',
      acceptedStatuses: [StatusCodes.BAD_REQUEST, StatusCodes.FORBIDDEN],
    },
  );
}

function toCredentialCheck(response) {
  const credentialStatus = {
    [StatusCodes.BAD_REQUEST]: CredentialStatus.VALID,
    [StatusCodes.FORBIDDEN]: CredentialStatus.INVALID,
  }[response.status];
  if (!credentialStatus || !isSiteAnswer(response)) {
    throw toUnavailableError(`Status ${response.status}.`);
  }
  return {
    credentialStatus,
    quotaRemainingCount: null,
    quotaAllowedCount: null,
    quotaResetAt: null,
  };
}

export const stremioCommunitySubtitlesMapping = {
  buildSearchRequest,
  toSearchHits,
  buildDownloadRequest,
  toDownload,
  buildCredentialCheckRequest,
  toCredentialCheck,
};
