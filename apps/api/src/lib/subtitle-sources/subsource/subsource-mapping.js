import {isNil, uniq} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {VideoType} from '@repo/shared/constants/video-type.js';
import {SubtitleFileExtension} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {
  toHitReleaseNames,
  toNullableBoolean,
  toSiteCount,
} from '../subtitle-source-contract.js';
import {SourceUnavailableError} from '../subtitle-source-errors.js';
import {
  readSubtitleSourceFileName,
  SUBTITLE_SOURCE_BROWSER_USER_AGENT,
  requireSubtitleSourceList,
  throwIfErrorBodyResponse,
  toSubtitleSourceStatusError,
} from '../subtitle-source-request.js';

const SUBSOURCE_API_URL = 'https://api.subsource.net';
const SUBTITLES_PAGE_LIMIT = 100;
const SUBTITLES_SORT = 'popular';
const CREDENTIAL_CHECK_QUERY = 'matrix';
const MACHINE_TRANSLATED_PATTERN = /(?:^|[^a-z])(?:machine|ai)(?:[^a-z]|$)/i;
const SITE_WORD_SEPARATOR_PATTERN = /[\s/]+/g;
const SITE_WORD_BRACKET_PATTERN = /[()]/g;
const CREDENTIAL_STATUS_BY_STATUS = new Map([
  [StatusCodes.UNAUTHORIZED, CredentialStatus.INVALID],
  [StatusCodes.FORBIDDEN, CredentialStatus.INVALID],
  [StatusCodes.TOO_MANY_REQUESTS, CredentialStatus.LIMITED],
]);
const SUBSOURCE_LANGUAGE_WORDS = new Map([
  [SubtitleLanguage.ABK, ['abkhazian']],
  [SubtitleLanguage.AFR, ['afrikaans']],
  [SubtitleLanguage.SQI, ['albanian']],
  [SubtitleLanguage.AMH, ['amharic']],
  [SubtitleLanguage.ARA, ['arabic']],
  [SubtitleLanguage.ARG, ['aragonese']],
  [SubtitleLanguage.HYE, ['armenian']],
  [SubtitleLanguage.ASM, ['assamese']],
  [SubtitleLanguage.AZE, ['azerbaijani']],
  [SubtitleLanguage.EUS, ['basque']],
  [SubtitleLanguage.BEL, ['belarusian']],
  [SubtitleLanguage.BEN, ['bengali']],
  [SubtitleLanguage.BOS, ['bosnian']],
  [SubtitleLanguage.POB, ['brazilian_portuguese', 'brazillian_portuguese']],
  [SubtitleLanguage.BRE, ['breton']],
  [SubtitleLanguage.BUL, ['bulgarian']],
  [SubtitleLanguage.MYA, ['burmese']],
  [SubtitleLanguage.CAT, ['catalan']],
  [
    SubtitleLanguage.ZHO,
    [
      'chinese',
      'chinese_simplified',
      'chinese_traditional',
      'chinese_cantonese',
      'chinese_bg_code',
      'chinese_bilingual',
      'big_5_code',
    ],
  ],
  [SubtitleLanguage.HRV, ['croatian']],
  [SubtitleLanguage.CES, ['czech']],
  [SubtitleLanguage.DAN, ['danish']],
  [SubtitleLanguage.NLD, ['dutch']],
  [SubtitleLanguage.ENG, ['english']],
  [SubtitleLanguage.EPO, ['espranto']],
  [SubtitleLanguage.EST, ['estonian']],
  [SubtitleLanguage.FAS, ['farsi_persian']],
  [SubtitleLanguage.FIN, ['finnish']],
  [SubtitleLanguage.FRE, ['french', 'french_france', 'french_canada']],
  [SubtitleLanguage.GLA, ['gaelic']],
  [SubtitleLanguage.GLG, ['gaelician']],
  [SubtitleLanguage.KAT, ['georgian']],
  [SubtitleLanguage.GER, ['german']],
  [SubtitleLanguage.ELL, ['greek']],
  [SubtitleLanguage.KAL, ['greenlandic']],
  [SubtitleLanguage.HEB, ['hebrew']],
  [SubtitleLanguage.HIN, ['hindi']],
  [SubtitleLanguage.HUN, ['hungarian']],
  [SubtitleLanguage.ISL, ['icelandic']],
  [SubtitleLanguage.IBO, ['igbo']],
  [SubtitleLanguage.IND, ['indonesian']],
  [SubtitleLanguage.INA, ['interlingua']],
  [SubtitleLanguage.GLE, ['irish']],
  [SubtitleLanguage.ITA, ['italian']],
  [SubtitleLanguage.JPN, ['japanese']],
  [SubtitleLanguage.KAN, ['kannada']],
  [SubtitleLanguage.KAZ, ['kazakh']],
  [SubtitleLanguage.KHM, ['khmer']],
  [SubtitleLanguage.KOR, ['korean']],
  [SubtitleLanguage.KUR, ['kurdish']],
  [SubtitleLanguage.KIR, ['kyrgyz']],
  [SubtitleLanguage.LAV, ['latvian']],
  [SubtitleLanguage.LIT, ['lithuanian']],
  [SubtitleLanguage.LTZ, ['luxembourgish']],
  [SubtitleLanguage.MKD, ['macedonian']],
  [SubtitleLanguage.MSA, ['malay']],
  [SubtitleLanguage.MAL, ['malayalam']],
  [SubtitleLanguage.MAR, ['marathi']],
  [SubtitleLanguage.MON, ['mongolian']],
  [SubtitleLanguage.NAV, ['navajo']],
  [SubtitleLanguage.NEP, ['nepali']],
  [SubtitleLanguage.SME, ['northen_sami']],
  [SubtitleLanguage.NOR, ['norwegian']],
  [SubtitleLanguage.OCI, ['occitan']],
  [SubtitleLanguage.ORI, ['odia']],
  [SubtitleLanguage.PUS, ['pashto', 'pushto']],
  [SubtitleLanguage.POL, ['polish']],
  [SubtitleLanguage.POR, ['portuguese']],
  [SubtitleLanguage.RON, ['romanian']],
  [SubtitleLanguage.RUS, ['russian']],
  [SubtitleLanguage.SRP, ['serbian']],
  [SubtitleLanguage.SND, ['sindhi']],
  [SubtitleLanguage.SIN, ['sinhala', 'sinhalese']],
  [SubtitleLanguage.SLK, ['slovak']],
  [SubtitleLanguage.SLV, ['slovenian']],
  [SubtitleLanguage.SOM, ['somali']],
  [SubtitleLanguage.SPA, ['spanish', 'spanish_spain']],
  [SubtitleLanguage.SPL, ['spanish_latin_america']],
  [SubtitleLanguage.SWA, ['swahili']],
  [SubtitleLanguage.SWE, ['swedish']],
  [SubtitleLanguage.TGL, ['tagalog', 'filipino']],
  [SubtitleLanguage.TAM, ['tamil']],
  [SubtitleLanguage.TAT, ['tatar']],
  [SubtitleLanguage.TEL, ['telugu']],
  [SubtitleLanguage.THA, ['thai']],
  [SubtitleLanguage.TUR, ['turkish']],
  [SubtitleLanguage.TUK, ['turkmen']],
  [SubtitleLanguage.UKR, ['ukrainian']],
  [SubtitleLanguage.URD, ['urdu']],
  [SubtitleLanguage.UZB, ['uzbek']],
  [SubtitleLanguage.VIE, ['vietnamese']],
  [SubtitleLanguage.CYM, ['welsh']],
]);

const languageCodeBySiteWord = new Map(
  [...SUBSOURCE_LANGUAGE_WORDS].flatMap(([languageCode, siteWords]) =>
    siteWords.map(siteWord => [siteWord, languageCode]),
  ),
);

function isSiteId(siteId) {
  return Number.isSafeInteger(siteId) && siteId > 0;
}

function toSiteWordForm(siteLanguage) {
  return siteLanguage
    .toLowerCase()
    .replace(SITE_WORD_BRACKET_PATTERN, '')
    .trim()
    .replace(SITE_WORD_SEPARATOR_PATTERN, '_');
}

function toLanguageCode(siteLanguage) {
  return typeof siteLanguage === 'string'
    ? (languageCodeBySiteWord.get(toSiteWordForm(siteLanguage)) ?? null)
    : null;
}

function toSiteWord(languageCode) {
  return SUBSOURCE_LANGUAGE_WORDS.get(languageCode)?.[0] ?? null;
}

function listSiteWords(languageCodes) {
  return uniq(languageCodes.map(toSiteWord).filter(Boolean));
}

function buildRequest(sitePath, searchParams, credential, requestOptions = {}) {
  const siteUrl = new URL(sitePath, SUBSOURCE_API_URL);
  siteUrl.search = new URLSearchParams(searchParams).toString();
  return {
    subtitleSource: SubtitleSource.SUBSOURCE,
    url: siteUrl.href,
    method: 'GET',
    headers: {
      ...(credential ? {'X-API-Key': credential.apiKey} : {}),
      'User-Agent': SUBTITLE_SOURCE_BROWSER_USER_AGENT,
    },
    responseType: 'json',
    acceptedStatuses: [],
    credentialId: credential?.credentialId ?? null,
    ...requestOptions,
  };
}

function isSeriesQuery({videoType}) {
  return videoType !== VideoType.MOVIE;
}

function buildMovieSearchRequest(searchQuery, credential) {
  if (
    !credential ||
    !searchQuery.imdbId ||
    (isSeriesQuery(searchQuery) && isNil(searchQuery.catalogSeason)) ||
    listSiteWords(searchQuery.languageCodes).length === 0
  ) {
    return null;
  }
  return buildRequest(
    '/api/v1/movies/search',
    {
      searchType: 'imdb',
      imdb: searchQuery.imdbId,
      ...(isSeriesQuery(searchQuery)
        ? {season: String(searchQuery.catalogSeason)}
        : {}),
    },
    credential,
  );
}

function findMovieId({status, body}, searchQuery) {
  if (status === StatusCodes.NOT_FOUND) {
    return null;
  }
  const siteMovie = requireSubtitleSourceList(body?.data, {
    subtitleSource: SubtitleSource.SUBSOURCE,
  }).find(
    candidate =>
      isSiteId(candidate?.movieId) &&
      candidate.imdbId === searchQuery.imdbId &&
      (!isSeriesQuery(searchQuery) ||
        candidate.season === searchQuery.catalogSeason),
  );
  return siteMovie?.movieId ?? null;
}

function buildSubtitlesRequests(movieId, {languageCodes}, credential) {
  return listSiteWords(languageCodes).map(siteWord =>
    buildRequest(
      '/api/v1/subtitles',
      {
        movieId: String(movieId),
        language: siteWord,
        limit: String(SUBTITLES_PAGE_LIMIT),
        sort: SUBTITLES_SORT,
      },
      credential,
    ),
  );
}

function toSiteFps(framerate) {
  const siteFps = Number(framerate);
  return Number.isFinite(siteFps) && siteFps > 0 ? siteFps : null;
}

function toSearchHit(siteSubtitle) {
  const languageCode = toLanguageCode(siteSubtitle?.language);
  if (languageCode === null || !isSiteId(siteSubtitle.subtitleId)) {
    return null;
  }
  return {
    subtitleSource: SubtitleSource.SUBSOURCE,
    siteFileId: String(siteSubtitle.subtitleId),
    languageCode,
    releaseNames: toHitReleaseNames(
      Array.isArray(siteSubtitle.releaseInfo)
        ? siteSubtitle.releaseInfo.filter(
            releaseName => typeof releaseName === 'string',
          )
        : [],
    ),
    fileExtension: SubtitleFileExtension.SRT,
    isSitePack: false,
    isHearingImpaired: toNullableBoolean(siteSubtitle.hearingImpaired),
    isForced: toNullableBoolean(siteSubtitle.foreignParts),
    isMachineTranslated:
      typeof siteSubtitle.productionType === 'string' &&
      MACHINE_TRANSLATED_PATTERN.test(siteSubtitle.productionType)
        ? true
        : null,
    isUploaderTrusted: null,
    isQuotaCostly: false,
    siteDownloadCount: toSiteCount(siteSubtitle.downloads),
    siteFps: toSiteFps(siteSubtitle.framerate),
    siteFileUrl: null,
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
  return requireSubtitleSourceList(body?.data, {
    subtitleSource: SubtitleSource.SUBSOURCE,
  })
    .map(toSearchHit)
    .filter(Boolean);
}

function buildDownloadRequest({siteFileId}, credential) {
  const downloadPath = `/api/v1/subtitles/${encodeURIComponent(siteFileId)}/download`;
  const downloadRequest = buildRequest(downloadPath, {}, credential, {
    responseType: 'bytes',
  });
  if (new URL(downloadRequest.url).pathname !== downloadPath) {
    throw new SourceUnavailableError({
      subtitleSource: SubtitleSource.SUBSOURCE,
      cause: new Error('No downloadable file id.'),
    });
  }
  return downloadRequest;
}

function toDownload(response) {
  if (response.status === StatusCodes.NOT_FOUND) {
    throw toSubtitleSourceStatusError(response, {
      subtitleSource: SubtitleSource.SUBSOURCE,
    });
  }
  throwIfErrorBodyResponse(response, {
    subtitleSource: SubtitleSource.SUBSOURCE,
  });
  return {
    fileBytes: response.body,
    fileNameHint: readSubtitleSourceFileName(response.headers),
    extractedEntryPath: null,
  };
}

function buildCredentialCheckRequest(credential) {
  return buildRequest(
    '/api/v1/movies/search',
    {searchType: 'text', q: CREDENTIAL_CHECK_QUERY},
    credential,
    {
      responseType: 'text',
      acceptedStatuses: [...CREDENTIAL_STATUS_BY_STATUS.keys()],
    },
  );
}

function toCredentialCheck(response) {
  if (response.status === StatusCodes.NOT_FOUND) {
    throw toSubtitleSourceStatusError(response, {
      subtitleSource: SubtitleSource.SUBSOURCE,
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

export const subsourceMapping = {
  buildMovieSearchRequest,
  findMovieId,
  buildSubtitlesRequests,
  toSearchHits,
  buildDownloadRequest,
  toDownload,
  buildCredentialCheckRequest,
  toCredentialCheck,
};
