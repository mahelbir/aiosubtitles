import {isNil, uniq} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {VideoType} from '@repo/shared/constants/video-type.js';
import {
  toHitFileExtension,
  toHitReleaseNames,
} from '../subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceUnavailableError,
} from '../subtitle-source-errors.js';
import {
  isSubtitleSourceErrorBodyResponse,
  isSubtitleSourceFileUrl,
  readSubtitleSourceFileName,
  toSubtitleSourceStatusError,
} from '../subtitle-source-request.js';

const BETASERIES_API_URL = 'https://api.betaseries.com';
const BETASERIES_API_VERSION = '3.0';
const INVALID_CREDENTIAL_CODE = 1001;
const SITE_NUMBER_PATTERN = /^\d+$/;
const NOTHING_FOUND_CODE = 4001;
const ALL_SITE_LANGUAGES = 'all';
const DEAD_SITE_SOURCE = 'seriessub';
const CREDENTIAL_CHECK_IMDB_ID = 'tt0903747';
const SITE_LANGUAGE_BY_LANGUAGE_CODE = new Map([
  [SubtitleLanguage.FRE, 'vf'],
  [SubtitleLanguage.ENG, 'vo'],
]);
const LANGUAGE_CODE_BY_SITE_LANGUAGE = new Map(
  [...SITE_LANGUAGE_BY_LANGUAGE_CODE].map(([languageCode, siteLanguage]) => [
    siteLanguage,
    languageCode,
  ]),
);

function toSiteNumber(siteValue) {
  const siteNumber =
    typeof siteValue === 'string' && SITE_NUMBER_PATTERN.test(siteValue)
      ? Number(siteValue)
      : siteValue;
  return Number.isSafeInteger(siteNumber) && siteNumber >= 0
    ? siteNumber
    : null;
}

function toSiteId(siteValue) {
  const siteId = toSiteNumber(siteValue);
  return siteId > 0 ? siteId : null;
}

function toSiteLanguages(languageCodes) {
  return uniq(
    languageCodes
      .map(languageCode => SITE_LANGUAGE_BY_LANGUAGE_CODE.get(languageCode))
      .filter(Boolean),
  );
}

function buildLookupRequest(sitePath, searchParams, credential) {
  const siteUrl = new URL(sitePath, BETASERIES_API_URL);
  siteUrl.search = new URLSearchParams(searchParams).toString();
  return {
    subtitleSource: SubtitleSource.BETASERIES,
    url: siteUrl.href,
    method: 'GET',
    headers: {
      'X-BetaSeries-Key': credential.apiKey,
      'X-BetaSeries-Version': BETASERIES_API_VERSION,
    },
    responseType: 'json',
    acceptedStatuses: [StatusCodes.BAD_REQUEST],
    credentialId: credential.credentialId,
  };
}

function readErrorCodes({status, body}) {
  return status === StatusCodes.BAD_REQUEST && Array.isArray(body?.errors)
    ? body.errors.map(siteError => Number(siteError?.code))
    : [];
}

function assertKnownErrorAnswer(response, credential) {
  if (response.status !== StatusCodes.BAD_REQUEST) {
    return;
  }
  const errorCodes = readErrorCodes(response);
  if (errorCodes.includes(INVALID_CREDENTIAL_CODE)) {
    throw new SourceCredentialError({
      subtitleSource: SubtitleSource.BETASERIES,
      credentialId: credential.credentialId,
    });
  }
  if (!errorCodes.includes(NOTHING_FOUND_CODE)) {
    throw new SourceUnavailableError({
      subtitleSource: SubtitleSource.BETASERIES,
      cause: new Error('Error answer without a known code.'),
    });
  }
}

function isNothingFound(response) {
  return readErrorCodes(response).includes(NOTHING_FOUND_CODE);
}

function readFoundBody(response, credential) {
  assertKnownErrorAnswer(response, credential);
  return isNothingFound(response) ? null : response.body;
}

function buildShowRequest(searchQuery, credential) {
  if (
    !credential ||
    searchQuery.videoType !== VideoType.SERIES ||
    !searchQuery.imdbId ||
    isNil(searchQuery.catalogSeason) ||
    isNil(searchQuery.catalogEpisode) ||
    toSiteLanguages(searchQuery.languageCodes).length === 0
  ) {
    return null;
  }
  return buildLookupRequest(
    '/shows/display',
    {imdb_id: searchQuery.imdbId},
    credential,
  );
}

function findShowId(response, credential) {
  return toSiteId(readFoundBody(response, credential)?.show?.id);
}

function buildEpisodeRequest(
  showId,
  {catalogSeason, catalogEpisode},
  credential,
) {
  return buildLookupRequest(
    '/shows/episodes',
    {
      id: String(showId),
      season: String(catalogSeason),
      episode: String(catalogEpisode),
    },
    credential,
  );
}

function findEpisodeId(response, {catalogSeason, catalogEpisode}, credential) {
  const siteEpisodes = readFoundBody(response, credential)?.episodes;
  if (!Array.isArray(siteEpisodes)) {
    return null;
  }
  const siteEpisode = siteEpisodes.find(
    candidate =>
      toSiteId(candidate?.id) !== null &&
      toSiteNumber(candidate.season) === catalogSeason &&
      toSiteNumber(candidate.episode) === catalogEpisode,
  );
  return siteEpisode ? toSiteId(siteEpisode.id) : null;
}

function buildSubtitlesRequest(episodeId, {languageCodes}, credential) {
  const siteLanguages = toSiteLanguages(languageCodes);
  return buildLookupRequest(
    '/subtitles/episode',
    {
      id: String(episodeId),
      language:
        siteLanguages.length === 1 ? siteLanguages[0] : ALL_SITE_LANGUAGES,
    },
    credential,
  );
}

function toLanguageCode(siteLanguage) {
  return typeof siteLanguage === 'string'
    ? (LANGUAGE_CODE_BY_SITE_LANGUAGE.get(siteLanguage.toLowerCase()) ?? null)
    : null;
}

function isDeadSiteSource(siteSource) {
  return (
    typeof siteSource === 'string' &&
    siteSource.toLowerCase() === DEAD_SITE_SOURCE
  );
}

function toSearchHit(siteSubtitle, {apiKey}) {
  const languageCode = toLanguageCode(siteSubtitle?.language);
  const siteFileId = toSiteId(siteSubtitle?.id);
  if (
    languageCode === null ||
    siteFileId === null ||
    !isSubtitleSourceFileUrl(siteSubtitle.url) ||
    siteSubtitle.url.includes(apiKey) ||
    isDeadSiteSource(siteSubtitle.source)
  ) {
    return null;
  }
  const fileName =
    typeof siteSubtitle.file === 'string' ? siteSubtitle.file : '';
  return {
    subtitleSource: SubtitleSource.BETASERIES,
    siteFileId: String(siteFileId),
    languageCode,
    releaseNames: toHitReleaseNames([fileName]),
    fileExtension: toHitFileExtension(fileName),
    isSitePack: false,
    isHearingImpaired: null,
    isForced: null,
    isMachineTranslated: null,
    isUploaderTrusted: null,
    isQuotaCostly: false,
    siteDownloadCount: null,
    siteFps: null,
    siteFileUrl: siteSubtitle.url,
    siteCueCount: null,
    siteDurationMs: null,
    hashMatchVideoHashes: [],
    subtitleAliases: [],
  };
}

function toSearchHits(response, credential) {
  const siteSubtitles = readFoundBody(response, credential)?.subtitles;
  return Array.isArray(siteSubtitles)
    ? siteSubtitles
        .map(siteSubtitle => toSearchHit(siteSubtitle, credential))
        .filter(Boolean)
    : [];
}

function buildDownloadRequest({siteFileUrl}) {
  if (!isSubtitleSourceFileUrl(siteFileUrl)) {
    throw new SourceUnavailableError({
      subtitleSource: SubtitleSource.BETASERIES,
      cause: new Error('No downloadable file url.'),
    });
  }
  return {
    subtitleSource: SubtitleSource.BETASERIES,
    url: siteFileUrl,
    method: 'GET',
    headers: {},
    responseType: 'bytes',
    acceptedStatuses: [],
    credentialId: null,
  };
}

function toDownload(response) {
  if (response.status !== StatusCodes.OK) {
    throw toSubtitleSourceStatusError(response, {
      subtitleSource: SubtitleSource.BETASERIES,
    });
  }
  if (isSubtitleSourceErrorBodyResponse(response.headers)) {
    throw new SourceUnavailableError({
      subtitleSource: SubtitleSource.BETASERIES,
      cause: new Error('Error body in place of the file.'),
    });
  }
  return {
    fileBytes: response.body,
    fileNameHint: readSubtitleSourceFileName(response.headers),
    extractedEntryPath: null,
  };
}

function buildCredentialCheckRequest(credential) {
  return buildLookupRequest(
    '/shows/display',
    {imdb_id: CREDENTIAL_CHECK_IMDB_ID},
    credential,
  );
}

function toCredentialCheck(response, credential) {
  assertKnownErrorAnswer(response, credential);
  return {
    credentialStatus: CredentialStatus.VALID,
    quotaRemainingCount: null,
    quotaAllowedCount: null,
    quotaResetAt: null,
  };
}

export const betaseriesMapping = {
  buildShowRequest,
  findShowId,
  buildEpisodeRequest,
  findEpisodeId,
  buildSubtitlesRequest,
  toSearchHits,
  buildDownloadRequest,
  toDownload,
  buildCredentialCheckRequest,
  toCredentialCheck,
};
