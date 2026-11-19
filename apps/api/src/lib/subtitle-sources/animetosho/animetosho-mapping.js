import {createDecompressStream} from '@napi-rs/lzma/xz';
import {isNil, isPlainObject, sortBy, uniq} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {ARCHIVE_INFLATED_BYTES_MAX} from '@repo/subtitle-core/archive/extract-subtitle-entries.js';
import {
  ASS_FILE_FORMATS,
  SubtitleFileFormat,
} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {parseReleaseName} from '@repo/subtitle-core/release-name/parse-release-name.js';
import {fromSiteLanguageCode} from '../site-language-codes.js';
import {
  toHitFileExtension,
  toHitReleaseNames,
  toHitSiteFileId,
  toNullableBoolean,
} from '../subtitle-source-contract.js';
import {SourceUnavailableError} from '../subtitle-source-errors.js';
import {
  parseSiteFileUrl,
  readCappedBody,
  toSubtitleSourceError,
  toSubtitleSourceStatusError,
} from '../subtitle-source-request.js';

export const ANIMETOSHO_TORRENT_OPEN_MAX = 5;

const ANIMETOSHO_FEED_URL = 'https://feed.animetosho.net/json';
const ANIMETOSHO_STORAGE_HOSTNAME = 'storage.animetosho.net';
const SUBTITLE_ATTACHMENT_TYPE = 'subtitle';
const XZ_SUFFIX_PATTERN = /\.xz$/i;
const BRAZILIAN_NAME_PATTERN = /brazil|\bbr\b/i;
const SUBRIP_CODEC_NAME = 'subrip';
const ATTACHMENT_FORMATS = new Set([
  ...ASS_FILE_FORMATS,
  SubtitleFileFormat.SRT,
  SUBRIP_CODEC_NAME,
]);

function toUnavailableError(reason) {
  return new SourceUnavailableError({
    subtitleSource: SubtitleSource.ANIMETOSHO,
    cause: new Error(reason),
  });
}

function throwUnlessFound(response) {
  if (response.status === StatusCodes.NOT_FOUND) {
    throw toSubtitleSourceStatusError(response, {
      subtitleSource: SubtitleSource.ANIMETOSHO,
    });
  }
}

function buildRequest(url, responseType = 'json') {
  return {
    subtitleSource: SubtitleSource.ANIMETOSHO,
    url,
    method: 'GET',
    headers: {},
    responseType,
    acceptedStatuses: [],
    credentialId: null,
  };
}

function buildFeedUrl(searchParams) {
  return `${ANIMETOSHO_FEED_URL}?${new URLSearchParams(searchParams)}`;
}

function parseAttachmentUrl(siteFileUrl) {
  return parseSiteFileUrl(siteFileUrl, {
    isSiteHostname: hostname => hostname === ANIMETOSHO_STORAGE_HOSTNAME,
  });
}

function isEpisodeRelease(
  {episodeNumbers, seasonNumbers, isSeasonPack},
  kitsuEpisode,
) {
  if (kitsuEpisode === null) {
    return (
      episodeNumbers.length === 0 && seasonNumbers.length === 0 && !isSeasonPack
    );
  }
  return episodeNumbers.includes(kitsuEpisode);
}

function toAnimeLookup({kitsuId, kitsuEpisode}) {
  return isNil(kitsuId) ? null : {kitsuId, kitsuEpisode: kitsuEpisode ?? null};
}

function buildFeedRequest(anidbId) {
  return buildRequest(buildFeedUrl({aid: anidbId}));
}

function buildTorrentRequest(torrentId) {
  return buildRequest(buildFeedUrl({show: 'torrent', id: torrentId}));
}

function pickTorrentIds(response, {anidbId, kitsuEpisode}) {
  throwUnlessFound(response);
  if (!Array.isArray(response.body)) {
    throw toUnavailableError('Feed is not a list.');
  }
  const episodeItems = response.body
    .filter(
      feedItem =>
        isPlainObject(feedItem) &&
        String(feedItem.anidb_aid ?? '') === String(anidbId) &&
        toHitSiteFileId(feedItem.id) !== null &&
        typeof feedItem.torrent_name === 'string',
    )
    .map(feedItem => ({
      torrentId: toHitSiteFileId(feedItem.id),
      releaseInfo: parseReleaseName(feedItem.torrent_name),
    }))
    .filter(({releaseInfo}) => isEpisodeRelease(releaseInfo, kitsuEpisode));
  return uniq(
    sortBy(episodeItems, [
      ({releaseInfo}) => releaseInfo.episodeNumbers.length,
    ]).map(({torrentId}) => torrentId),
  ).slice(0, ANIMETOSHO_TORRENT_OPEN_MAX);
}

function toAttachmentLanguageCode({language_code: siteLanguageCode, name}) {
  const languageCode = fromSiteLanguageCode(siteLanguageCode);
  return languageCode === SubtitleLanguage.POR &&
    BRAZILIAN_NAME_PATTERN.test(typeof name === 'string' ? name : '')
    ? SubtitleLanguage.POB
    : languageCode;
}

function toSearchHit(attachment, {releaseNames, languageCodes}) {
  const attachmentInfo = attachment?.info;
  if (
    attachment?.type !== SUBTITLE_ATTACHMENT_TYPE ||
    !isPlainObject(attachmentInfo)
  ) {
    return null;
  }
  const siteFileId = toHitSiteFileId(attachment.id);
  const languageCode = toAttachmentLanguageCode(attachmentInfo);
  const attachmentFormat = String(attachmentInfo.format ?? '').toLowerCase();
  if (
    siteFileId === null ||
    !languageCodes.has(languageCode) ||
    !ATTACHMENT_FORMATS.has(attachmentFormat) ||
    parseAttachmentUrl(attachment.url) === null
  ) {
    return null;
  }
  return {
    subtitleSource: SubtitleSource.ANIMETOSHO,
    siteFileId,
    languageCode,
    releaseNames,
    fileExtension: toHitFileExtension(attachmentFormat),
    isSitePack: false,
    isHearingImpaired: null,
    isForced: toNullableBoolean(attachmentInfo.forced),
    isMachineTranslated: null,
    isUploaderTrusted: null,
    isQuotaCostly: false,
    siteDownloadCount: null,
    siteFps: null,
    siteFileUrl: attachment.url,
    siteCueCount: null,
    siteDurationMs: null,
    hashMatchVideoHashes: [],
    subtitleAliases: [],
  };
}

function isEpisodeFile(torrentDetail, torrentFile, kitsuEpisode) {
  return (
    torrentDetail.is_batch !== true ||
    kitsuEpisode === null ||
    (typeof torrentFile.filename === 'string' &&
      isEpisodeRelease(parseReleaseName(torrentFile.filename), kitsuEpisode))
  );
}

function toSearchHits(response, {kitsuEpisode, languageCodes}) {
  throwUnlessFound(response);
  const torrentDetail = response.body;
  if (!isPlainObject(torrentDetail) || !Array.isArray(torrentDetail.files)) {
    throw toUnavailableError('Torrent detail has no file list.');
  }
  const hitContext = {
    releaseNames: toHitReleaseNames(
      typeof torrentDetail.torrent_name === 'string'
        ? [torrentDetail.torrent_name]
        : [],
    ),
    languageCodes: new Set(languageCodes),
  };
  return torrentDetail.files
    .filter(
      torrentFile =>
        isPlainObject(torrentFile) &&
        Array.isArray(torrentFile.attachments) &&
        isEpisodeFile(torrentDetail, torrentFile, kitsuEpisode),
    )
    .flatMap(torrentFile =>
      torrentFile.attachments.map(attachment =>
        toSearchHit(attachment, hitContext),
      ),
    )
    .filter(Boolean);
}

function buildDownloadRequest({siteFileUrl}) {
  if (parseAttachmentUrl(siteFileUrl) === null) {
    throw toUnavailableError('Attachment url is off the AnimeTosho storage.');
  }
  return buildRequest(siteFileUrl, 'bytes');
}

function readFileNameHint(siteFileUrl) {
  const fileName =
    parseAttachmentUrl(siteFileUrl)?.searchParams.get('filename');
  return fileName ? fileName.replace(XZ_SUFFIX_PATTERN, '') : null;
}

async function decodeXz(xzBytes, {decodedBytesMax, createDecoder}) {
  const decoder = createDecoder();
  decoder.end(xzBytes);
  const fileBytes = await readCappedBody(decoder, decodedBytesMax);
  if (fileBytes.byteLength === 0) {
    throw toUnavailableError('Attachment decodes to nothing.');
  }
  return fileBytes;
}

async function toDownload(
  response,
  {
    siteFileUrl,
    decodedBytesMax = ARCHIVE_INFLATED_BYTES_MAX,
    createDecoder = createDecompressStream,
  },
) {
  throwUnlessFound(response);
  if (!Buffer.isBuffer(response.body) || response.body.byteLength === 0) {
    throw toUnavailableError('Attachment is empty.');
  }
  try {
    return {
      fileBytes: await decodeXz(response.body, {
        decodedBytesMax,
        createDecoder,
      }),
      fileNameHint: readFileNameHint(siteFileUrl),
      extractedEntryPath: null,
    };
  } catch (error) {
    throw toSubtitleSourceError(error, {
      subtitleSource: SubtitleSource.ANIMETOSHO,
    });
  }
}

export const animetoshoMapping = {
  toAnimeLookup,
  buildFeedRequest,
  buildTorrentRequest,
  pickTorrentIds,
  toSearchHits,
  buildDownloadRequest,
  toDownload,
};
