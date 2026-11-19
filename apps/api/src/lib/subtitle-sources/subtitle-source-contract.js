import {Enum} from 'enum-plus';
import {isBoolean, isNil, uniq} from 'es-toolkit';
import {z} from 'zod';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {VideoType} from '@repo/shared/constants/video-type.js';
import {httpUrlField} from '@repo/shared/schemas/common.js';
import {
  ARCHIVE_FILE_EXTENSIONS,
  ASS_FILE_FORMATS,
  SUBTITLE_FORMAT_FILE_EXTENSIONS,
  SubtitleFileExtension,
} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {computeUrlCode} from '@repo/subtitle-core/stremio-row/url-code.js';
import {SubtitleAliasSource} from './subtitle-alias-source.js';

/**
 * @typedef {object} SubtitleSearchQuery
 * @property {string} videoId
 * @property {string} videoType
 * @property {string|null} imdbId
 * @property {string|null} kitsuId
 * @property {number|null} catalogSeason
 * @property {number|null} catalogEpisode
 * @property {number|null} kitsuEpisode
 * @property {string|null} tvdbId
 * @property {string|null} catalogTitle
 * @property {number|null} catalogYear
 * @property {string[]} languageCodes
 * @property {string|null} videoHash
 * @property {number|null} videoSizeBytes
 * @property {string|null} videoFilename
 * @property {boolean} [isEpisodeResolved]
 * @property {boolean} [isCatalogResolved]
 */

/**
 * @typedef {object} SubtitleSourceCredential
 * @property {string} credentialId
 * @property {string} credentialKind
 * @property {string} [apiKey]
 * @property {string} [username]
 * @property {string} [password]
 * @property {string} [accessToken]
 */

/**
 * @typedef {object} SubtitleAliasValues
 * @property {string} aliasSource
 * @property {string} aliasSiteFileId
 */

/**
 * @typedef {object} SubtitleSourceHit
 * @property {string} subtitleSource
 * @property {string} siteFileId
 * @property {string} languageCode
 * @property {string[]} releaseNames
 * @property {'srt'|'ass'} fileExtension
 * @property {boolean} isSitePack
 * @property {boolean|null} isHearingImpaired
 * @property {boolean|null} isForced
 * @property {boolean|null} isMachineTranslated
 * @property {boolean|null} isUploaderTrusted
 * @property {boolean|null} isQuotaCostly
 * @property {number|null} siteDownloadCount
 * @property {number|null} siteFps
 * @property {string|null} siteFileUrl
 * @property {number|null} siteCueCount
 * @property {number|null} siteDurationMs
 * @property {string[]} hashMatchVideoHashes
 * @property {SubtitleAliasValues[]} subtitleAliases
 */

/**
 * @typedef {object} SubtitleRef
 * @property {string} subtitleSource
 * @property {string} siteFileId
 * @property {string|null} siteFileUrl
 * @property {number|null} catalogSeason
 * @property {number|null} catalogEpisode
 * @property {number|null} [kitsuEpisode]
 * @property {boolean} [isSitePack]
 */

/**
 * @typedef {object} SubtitleSourceDownload
 * @property {Uint8Array} fileBytes
 * @property {string|null} fileNameHint
 * @property {string|null} extractedEntryPath
 */

/**
 * @typedef {object} CredentialCheck
 * @property {string} credentialStatus
 * @property {number|null} quotaRemainingCount
 * @property {number|null} quotaAllowedCount
 * @property {string|null} quotaResetAt
 */

/**
 * @typedef {object} DownloadBudget
 * @property {string} budgetScope
 * @property {number} windowMs
 * @property {number} requestMax
 */

/**
 * @typedef {object} SubtitleSourceCallOptions
 * @property {AbortSignal} [signal]
 */

/**
 * @typedef {object} SubtitleSourceClient
 * @property {string} subtitleSource
 * @property {string[]} credentialKinds
 * @property {boolean} isSearchHashSensitive
 * @property {boolean} [isSearchCredentialScoped]
 * @property {boolean} [canUseSharedCredential]
 * @property {boolean} [isDownloadKeyless]
 * @property {DownloadBudget[]} downloadBudgets
 * @property {() => boolean|Promise<boolean>} canSearchWithoutCredential
 * @property {() => boolean|Promise<boolean>} canDownloadWithoutCredential
 * @property {(searchQuery: SubtitleSearchQuery, credential: SubtitleSourceCredential|null, callOptions?: SubtitleSourceCallOptions) => Promise<SubtitleSourceHit[]|null>} searchSubtitles
 * @property {(subtitleRef: SubtitleRef, credential: SubtitleSourceCredential|null, callOptions?: SubtitleSourceCallOptions) => Promise<SubtitleSourceDownload>} downloadSubtitle
 * @property {(credential: SubtitleSourceCredential, callOptions?: SubtitleSourceCallOptions) => Promise<CredentialCheck>} [checkCredential]
 * @property {(credential: SubtitleSourceCredential, callOptions?: SubtitleSourceCallOptions) => Promise<CredentialCheck>} [readQuota]
 */

export const SITE_FILE_ID_LENGTH_MAX = 512;
const RELEASE_NAMES_MAX = 20;
const RELEASE_NAME_LENGTH_MAX = 512;
export const INTEGER_COLUMN_MAX = 2147483647;
const HASH_MATCH_VIDEO_HASHES_MAX = 20;
export const VIDEO_HASH_PATTERN = /^[\da-f]{16}$/i;
const LEADING_DOT_PATTERN = /^\./;
const IMDB_VIDEO_ID_SEPARATOR = ':';

const supportedFileExtensions = new Set([
  ...SUBTITLE_FORMAT_FILE_EXTENSIONS,
  ...ARCHIVE_FILE_EXTENSIONS,
]);

export const SubtitleSourceBudgetScope = Enum({
  SUBTITLE_SOURCE: {value: 'subtitle-source'},
  CREDENTIAL: {value: 'credential'},
});

const nullableBooleanField = z.boolean().nullable();
const nullableCountField = z
  .number()
  .int()
  .nonnegative()
  .max(INTEGER_COLUMN_MAX)
  .nullable();

export const subtitleSourceHitSchema = z.object({
  subtitleSource: z.enum(SubtitleSource.values),
  siteFileId: z.string().min(1).max(SITE_FILE_ID_LENGTH_MAX),
  languageCode: z.enum(SubtitleLanguage.values),
  releaseNames: z
    .array(z.string().max(RELEASE_NAME_LENGTH_MAX))
    .max(RELEASE_NAMES_MAX),
  fileExtension: z.enum(SubtitleFileExtension.values),
  isSitePack: z.boolean(),
  isHearingImpaired: nullableBooleanField,
  isForced: nullableBooleanField,
  isMachineTranslated: nullableBooleanField,
  isUploaderTrusted: nullableBooleanField,
  isQuotaCostly: nullableBooleanField,
  siteDownloadCount: nullableCountField,
  siteFps: z
    .number()
    .nonnegative()
    .nullable()
    .transform(siteFps => siteFps || null),
  siteFileUrl: httpUrlField.nullable(),
  siteCueCount: nullableCountField,
  siteDurationMs: nullableCountField,
  hashMatchVideoHashes: z
    .array(z.string().regex(VIDEO_HASH_PATTERN))
    .max(HASH_MATCH_VIDEO_HASHES_MAX),
  subtitleAliases: z.array(
    z.object({
      aliasSource: z.enum(SubtitleAliasSource.values),
      aliasSiteFileId: z.string().min(1).max(SITE_FILE_ID_LENGTH_MAX),
    }),
  ),
});

export function isSupportedSubtitleSourceFormat(format) {
  if (typeof format !== 'string') {
    return true;
  }
  const fileExtension = format
    .trim()
    .toLowerCase()
    .replace(LEADING_DOT_PATTERN, '');
  return fileExtension === '' || supportedFileExtensions.has(fileExtension);
}

export function toHitSiteFileId(siteFileId) {
  if (typeof siteFileId === 'string') {
    const trimmedSiteFileId = siteFileId.trim();
    return trimmedSiteFileId.length <= SITE_FILE_ID_LENGTH_MAX
      ? trimmedSiteFileId || null
      : null;
  }
  return Number.isSafeInteger(siteFileId) && siteFileId > 0
    ? String(siteFileId)
    : null;
}

export function buildImdbVideoId({
  videoType,
  imdbId,
  catalogSeason,
  catalogEpisode,
}) {
  if (!imdbId) {
    return null;
  }
  if (videoType === VideoType.MOVIE) {
    return encodeURIComponent(imdbId);
  }
  if (isNil(catalogSeason) || isNil(catalogEpisode)) {
    return null;
  }
  return [imdbId, catalogSeason, catalogEpisode]
    .map(idPart => encodeURIComponent(idPart))
    .join(IMDB_VIDEO_ID_SEPARATOR);
}

export function toNullableBoolean(siteValue) {
  return isBoolean(siteValue) ? siteValue : null;
}

export function toSiteCount(siteValue) {
  const siteCount =
    typeof siteValue === 'string' && siteValue.trim() !== ''
      ? Number(siteValue)
      : siteValue;
  return Number.isSafeInteger(siteCount) &&
    siteCount >= 0 &&
    siteCount <= INTEGER_COLUMN_MAX
    ? siteCount
    : null;
}

function readFormatName(fileNameOrFormat) {
  return String(fileNameOrFormat ?? '')
    .split('.')
    .at(-1)
    .toLowerCase();
}

export function toHitFileExtension(fileName) {
  return ASS_FILE_FORMATS.has(readFormatName(fileName))
    ? SubtitleFileExtension.ASS
    : SubtitleFileExtension.SRT;
}

export function toHitReleaseNames(releaseNames) {
  return uniq(
    releaseNames
      .map(releaseName => releaseName.trim())
      .filter(
        releaseName =>
          releaseName !== '' && releaseName.length <= RELEASE_NAME_LENGTH_MAX,
      ),
  ).slice(0, RELEASE_NAMES_MAX);
}

/**
 * @param {SubtitleSourceHit} hit
 * @returns {object}
 */
export function toSubtitleRowValues(hit) {
  const archiveEntryPath = '';
  return {
    urlCode: computeUrlCode({...hit, archiveEntryPath}),
    subtitleSource: hit.subtitleSource,
    siteFileId: hit.siteFileId,
    archiveEntryPath,
    fileExtension: hit.fileExtension,
    siteLanguageCode: hit.languageCode,
    releaseNames: hit.releaseNames,
    isHearingImpaired: hit.isHearingImpaired,
    isForced: hit.isForced,
    isMachineTranslated: hit.isMachineTranslated,
    isUploaderTrusted: hit.isUploaderTrusted,
    isQuotaCostly: hit.isQuotaCostly,
    isSitePack: hit.isSitePack,
    siteDownloadCount: hit.siteDownloadCount,
    siteFps: hit.siteFps,
    siteFileUrl: hit.siteFileUrl,
    siteCueCount: hit.siteCueCount,
    siteDurationMs: hit.siteDurationMs,
  };
}
