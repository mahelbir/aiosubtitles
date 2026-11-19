import {load} from 'cheerio';
import {StatusCodes} from 'http-status-codes';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {VideoType} from '@repo/shared/constants/video-type.js';
import {toSubtitleLanguageCode} from '@repo/shared/lib/subtitle-language.js';
import {SubtitleFileExtension} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {toHitReleaseNames} from '../subtitle-source-contract.js';
import {SourceUnavailableError} from '../subtitle-source-errors.js';
import {
  SUBTITLE_SOURCE_BROWSER_USER_AGENT,
  parseSiteFileUrl,
  readSubtitleSourceFileName,
  toSubtitleSourceStatusError,
} from '../subtitle-source-request.js';

const YIFY_SITE_URL = 'https://yts-subs.com';
const YIFY_HOSTNAME = 'yts-subs.com';
const YIFY_PAGE_TITLE_PATTERN = /YIFY subtitles/i;
const SUBTITLE_PAGE_PATH_PREFIX = '/subtitles/';
const SUBTITLE_SLUG_PATTERN = /^[a-z0-9-]+-yify-\d+$/;
const RELEASE_NAME_SEPARATOR_PATTERN = /\r?\n/;

function toUnavailableError(message) {
  return new SourceUnavailableError({
    subtitleSource: SubtitleSource.YIFY,
    cause: new Error(message),
  });
}

function throwUnlessFound(response) {
  if (response.status !== StatusCodes.OK) {
    throw toSubtitleSourceStatusError(response, {
      subtitleSource: SubtitleSource.YIFY,
    });
  }
}

function buildRequest(siteUrl, responseType) {
  return {
    subtitleSource: SubtitleSource.YIFY,
    url: siteUrl,
    method: 'GET',
    headers: {'User-Agent': SUBTITLE_SOURCE_BROWSER_USER_AGENT},
    responseType,
    acceptedStatuses: [],
    credentialId: null,
  };
}

function loadYifyPage(pageHtml) {
  const $ = load(typeof pageHtml === 'string' ? pageHtml : '');
  if (!YIFY_PAGE_TITLE_PATTERN.test($('title').first().text())) {
    throw toUnavailableError('Not a YIFY page.');
  }
  return $;
}

function isYifyHostname(hostname) {
  return hostname === YIFY_HOSTNAME || hostname.endsWith(`.${YIFY_HOSTNAME}`);
}

function buildSearchRequest({videoType, imdbId}) {
  if (videoType !== VideoType.MOVIE || !imdbId) {
    return null;
  }
  return buildRequest(
    `${YIFY_SITE_URL}/movie-imdb/${encodeURIComponent(imdbId)}`,
    'text',
  );
}

function readReleaseNames(releaseAnchor) {
  const releaseCell = releaseAnchor.clone();
  releaseCell.find('span.text-muted').remove();
  releaseCell.find('br').replaceWith('\n');
  return toHitReleaseNames(
    releaseCell.text().split(RELEASE_NAME_SEPARATOR_PATTERN),
  );
}

function readSubtitleRow(row) {
  const releaseAnchor = row
    .find(`td:not(.download-cell) a[href^="${SUBTITLE_PAGE_PATH_PREFIX}"]`)
    .first();
  const siteFileId = (releaseAnchor.attr('href') ?? '').slice(
    SUBTITLE_PAGE_PATH_PREFIX.length,
  );
  return SUBTITLE_SLUG_PATTERN.test(siteFileId)
    ? {row, releaseAnchor, siteFileId}
    : null;
}

function toSearchHit({row, releaseAnchor, siteFileId}) {
  const languageCode = toSubtitleLanguageCode(
    row.find('td.flag-cell .sub-lang').first().text(),
  );
  if (languageCode === null) {
    return null;
  }
  return {
    subtitleSource: SubtitleSource.YIFY,
    siteFileId,
    languageCode,
    releaseNames: readReleaseNames(releaseAnchor),
    fileExtension: SubtitleFileExtension.SRT,
    isSitePack: false,
    isHearingImpaired: null,
    isForced: null,
    isMachineTranslated: null,
    isUploaderTrusted: null,
    isQuotaCostly: false,
    siteDownloadCount: null,
    siteFps: null,
    siteFileUrl: null,
    siteCueCount: null,
    siteDurationMs: null,
    hashMatchVideoHashes: [],
    subtitleAliases: [],
  };
}

function toSearchHits(response) {
  if (response.status === StatusCodes.NOT_FOUND) {
    return [];
  }
  throwUnlessFound(response);
  const $ = loadYifyPage(response.body);
  const subtitleTable = $('table.other-subs');
  if (subtitleTable.length === 0 || $('h2.movie-main-title').length === 0) {
    throw toUnavailableError('Movie page unreadable.');
  }
  const subtitleRows = subtitleTable.find('tbody tr[data-id]').toArray();
  const readableRows = subtitleRows
    .map(subtitleRow => readSubtitleRow($(subtitleRow)))
    .filter(Boolean);
  if (subtitleRows.length > 0 && readableRows.length === 0) {
    throw toUnavailableError('Subtitle rows unreadable.');
  }
  return readableRows.map(toSearchHit).filter(Boolean);
}

function buildDownloadRequest({siteFileId}) {
  return buildRequest(
    `${YIFY_SITE_URL}${SUBTITLE_PAGE_PATH_PREFIX}${encodeURIComponent(siteFileId)}`,
    'text',
  );
}

function toFileUrl(dataLink) {
  const fileUrlText = Buffer.from(dataLink ?? '', 'base64').toString('utf8');
  if (!URL.canParse(fileUrlText)) {
    throw toUnavailableError('Malformed download link.');
  }
  const fileUrl = parseSiteFileUrl(fileUrlText, {
    isSiteHostname: isYifyHostname,
  });
  if (fileUrl === null) {
    throw toUnavailableError('Refused download link.');
  }
  return fileUrl.href;
}

function toDownloadLink(pageResponse) {
  throwUnlessFound(pageResponse);
  const $ = loadYifyPage(pageResponse.body);
  const downloadButton = $('a#btn-download-subtitle[data-link]').first();
  if (downloadButton.length === 0) {
    throw toUnavailableError('Download button missing.');
  }
  return {fileUrl: toFileUrl(downloadButton.attr('data-link'))};
}

function buildFileRequest({fileUrl}) {
  return buildRequest(fileUrl, 'bytes');
}

function toDownload(fileResponse) {
  throwUnlessFound(fileResponse);
  return {
    fileBytes: fileResponse.body,
    fileNameHint: readSubtitleSourceFileName(fileResponse.headers),
    extractedEntryPath: null,
  };
}

export const yifyMapping = {
  buildSearchRequest,
  toSearchHits,
  buildDownloadRequest,
  toDownloadLink,
  buildFileRequest,
  toDownload,
};
