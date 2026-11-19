import {load} from 'cheerio';
import {isNil, uniqBy} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {VideoType} from '@repo/shared/constants/video-type.js';
import {toSubtitleLanguageCode} from '@repo/shared/lib/subtitle-language.js';
import {SubtitleFileExtension} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {toHitReleaseNames, toSiteCount} from '../subtitle-source-contract.js';
import {SourceUnavailableError} from '../subtitle-source-errors.js';
import {
  SUBTITLE_SOURCE_BROWSER_USER_AGENT,
  parseSiteFileUrl,
  readSubtitleSourceFileName,
  toSubtitleSourceStatusError,
} from '../subtitle-source-request.js';

const TVSUBTITLES_SITE_URL = 'https://www.tvsubtitles.net';
const TVSUBTITLES_HOSTNAME = 'www.tvsubtitles.net';
const TVSUBTITLES_PAGE_TITLE_PATTERN = /TVsubtitles/i;
const SHOW_LINK_PATTERN = /^\/?tvshow-(\d+)\.html$/;
const SHOW_YEARS_PATTERN = /\((\d{4})(?:-\d{0,4})?\)\s*$/;
const TITLE_TAG_PATTERN = /\s*\(([A-Z]{2}|\d{4})\)$/;
const YEAR_TAG_PATTERN = /^\d{4}$/;
const ANY_SUBTITLE_LINK_PATTERN = /^\/?subtitle-\d+\.html$/;
const SHOW_YEAR_TOLERANCE = 1;
const WHITESPACE_PATTERN = /\s+/g;
const EPISODE_NUMBER_PATTERN = /^(\d+)x(\d+)$/;
const EPISODE_LINK_PATTERN = /^episode-(\d+)\.html$/;
const SUBTITLE_LINK_PATTERN = /^\/subtitle-(\d+)\.html$/;
const FLAG_IMAGE_PATTERN = /(?:^|\/)images\/flags\/([a-z]+)\.gif$/;
const SCRIPT_PART_PATTERN = /\bvar\s+(s\d+)\s*=\s*'((?:[^'\\]|\\.)*)'/g;
const SCRIPT_ESCAPE_PATTERN = /\\(.)/g;
const SCRIPT_LOCATION_PATTERN = /document\.location\s*=\s*([^;]+);/;
const SCRIPT_PART_NAME_PATTERN = /^s\d+$/;
const FILE_PATH_PREFIX = '/files/';
const ZIP_FILE_PATTERN = /\.zip$/i;
const SITE_LANGUAGE_ALIASES = new Map([
  ['br', 'pob'],
  ['ua', 'ukr'],
  ['gr', 'ell'],
  ['cn', 'zho'],
  ['jp', 'jpn'],
  ['cz', 'ces'],
]);
const titleCollator = new Intl.Collator('en', {sensitivity: 'accent'});
const regionNames = new Intl.DisplayNames(['en'], {
  type: 'region',
  fallback: 'none',
});

function toUnavailableError(message) {
  return new SourceUnavailableError({
    subtitleSource: SubtitleSource.TVSUBTITLES,
    cause: new Error(message),
  });
}

function throwUnlessFound(response) {
  if (response.status !== StatusCodes.OK) {
    throw toSubtitleSourceStatusError(response, {
      subtitleSource: SubtitleSource.TVSUBTITLES,
    });
  }
}

function buildRequest(siteUrl, responseType, requestOptions = {}) {
  return {
    subtitleSource: SubtitleSource.TVSUBTITLES,
    url: siteUrl,
    method: 'GET',
    ...requestOptions,
    headers: {
      'User-Agent': SUBTITLE_SOURCE_BROWSER_USER_AGENT,
      ...requestOptions.headers,
    },
    responseType,
    acceptedStatuses: [],
    credentialId: null,
  };
}

function loadTvsubtitlesPage(pageHtml) {
  const $ = load(typeof pageHtml === 'string' ? pageHtml : '');
  if (!TVSUBTITLES_PAGE_TITLE_PATTERN.test($('title').first().text())) {
    throw toUnavailableError('Not a TVsubtitles page.');
  }
  return $;
}

function toComparableTitle(showTitle) {
  return showTitle.normalize('NFKC').replace(WHITESPACE_PATTERN, ' ').trim();
}

function isSameTitle(leftTitle, rightTitle) {
  return titleCollator.compare(leftTitle, rightTitle) === 0;
}

function isRegionCode(tag) {
  return regionNames.of(tag) !== undefined;
}

function parseShowTitle(showTitle) {
  let baseTitle = toComparableTitle(showTitle);
  let countryTag = null;
  let yearTag = null;
  let tagMatch = baseTitle.match(TITLE_TAG_PATTERN);
  while (tagMatch !== null) {
    const [tagText, tag] = tagMatch;
    if (YEAR_TAG_PATTERN.test(tag)) {
      yearTag ??= Number(tag);
    } else if (isRegionCode(tag)) {
      countryTag ??= tag;
    } else {
      break;
    }
    baseTitle = baseTitle.slice(0, -tagText.length);
    tagMatch = baseTitle.match(TITLE_TAG_PATTERN);
  }
  return {
    fullTitle: toComparableTitle(showTitle),
    baseTitle,
    countryTag,
    yearTag,
  };
}

function readShowLink($, linkElement) {
  const showMatch = ($(linkElement).attr('href') ?? '').match(
    SHOW_LINK_PATTERN,
  );
  if (showMatch === null) {
    return null;
  }
  const linkText = toComparableTitle($(linkElement).text());
  const yearsMatch = linkText.match(SHOW_YEARS_PATTERN);
  const showTitle = parseShowTitle(linkText.replace(SHOW_YEARS_PATTERN, ''));
  return {
    showId: showMatch[1],
    ...showTitle,
    showYear: yearsMatch ? Number(yearsMatch[1]) : showTitle.yearTag,
  };
}

function isMatchingShow(showLink, wantedShow) {
  const isFullTitleSame = isSameTitle(showLink.fullTitle, wantedShow.fullTitle);
  if (
    !isFullTitleSame &&
    !isSameTitle(showLink.baseTitle, wantedShow.baseTitle)
  ) {
    return false;
  }
  const isYearKnown = !isNil(showLink.showYear) && !isNil(wantedShow.showYear);
  if (
    isYearKnown &&
    Math.abs(showLink.showYear - wantedShow.showYear) > SHOW_YEAR_TOLERANCE
  ) {
    return false;
  }
  if (isFullTitleSame) {
    return true;
  }
  if (showLink.countryTag !== null && wantedShow.countryTag !== null) {
    return showLink.countryTag === wantedShow.countryTag;
  }
  return showLink.countryTag === wantedShow.countryTag || isYearKnown;
}

function pickSingleShowId(showLinks) {
  return showLinks.length === 1 ? showLinks[0].showId : null;
}

function pickShowId(showLinks, wantedShow) {
  if (showLinks.length <= 1) {
    return showLinks[0]?.showId ?? null;
  }
  return (
    pickSingleShowId(
      isNil(wantedShow.showYear)
        ? []
        : showLinks.filter(({showYear}) => showYear === wantedShow.showYear),
    ) ??
    pickSingleShowId(
      showLinks.filter(({fullTitle}) =>
        isSameTitle(fullTitle, wantedShow.fullTitle),
      ),
    )
  );
}

function buildSearchRequest({
  videoType,
  catalogTitle,
  catalogSeason,
  catalogEpisode,
}) {
  if (
    videoType !== VideoType.SERIES ||
    !catalogTitle ||
    !Number.isInteger(catalogSeason) ||
    !Number.isInteger(catalogEpisode)
  ) {
    return null;
  }
  return buildRequest(`${TVSUBTITLES_SITE_URL}/search2.php`, 'text', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({qs: catalogTitle}).toString(),
  });
}

function findShowId(response, {catalogTitle, catalogYear = null}) {
  throwUnlessFound(response);
  const $ = loadTvsubtitlesPage(response.body);
  const wantedTitle = parseShowTitle(catalogTitle ?? '');
  const wantedShow = {
    ...wantedTitle,
    showYear: catalogYear ?? wantedTitle.yearTag,
  };
  const showLinks = uniqBy(
    $('a[href]')
      .toArray()
      .map(linkElement => readShowLink($, linkElement))
      .filter(Boolean),
    ({showId}) => showId,
  );
  return pickShowId(
    showLinks.filter(showLink => isMatchingShow(showLink, wantedShow)),
    wantedShow,
  );
}

function toSeasonPath(showId, catalogSeason) {
  return `tvshow-${encodeURIComponent(showId)}-${catalogSeason}.html`;
}

function buildSeasonRequest(showId, {catalogSeason}) {
  return buildRequest(
    `${TVSUBTITLES_SITE_URL}/${toSeasonPath(showId, catalogSeason)}`,
    'text',
  );
}

function isEpisodeRow($, rowElement, {catalogSeason, catalogEpisode}) {
  const episodeMatch = $(rowElement)
    .children('td')
    .first()
    .text()
    .trim()
    .match(EPISODE_NUMBER_PATTERN);
  return (
    episodeMatch !== null &&
    Number(episodeMatch[1]) === catalogSeason &&
    Number(episodeMatch[2]) === catalogEpisode
  );
}

function findEpisodeId(response, searchQuery) {
  if (response.status === StatusCodes.NOT_FOUND) {
    return null;
  }
  throwUnlessFound(response);
  const $ = loadTvsubtitlesPage(response.body);
  const episodeTable = $('table#table5');
  if (episodeTable.length === 0) {
    throw toUnavailableError('Season page unreadable.');
  }
  const episodeRow = episodeTable
    .find('tr')
    .toArray()
    .find(rowElement => isEpisodeRow($, rowElement, searchQuery));
  if (!episodeRow) {
    return null;
  }
  const episodeMatch = (
    $(episodeRow).find('td:nth-child(2) a[href]').first().attr('href') ?? ''
  ).match(EPISODE_LINK_PATTERN);
  if (episodeMatch === null) {
    throw toUnavailableError('Episode link unreadable.');
  }
  return episodeMatch[1];
}

function buildEpisodeRequest(episodeId) {
  return buildRequest(
    `${TVSUBTITLES_SITE_URL}/episode-${encodeURIComponent(episodeId)}.html`,
    'text',
  );
}

function toSiteLanguageCode(flagSource) {
  return (flagSource ?? '').match(FLAG_IMAGE_PATTERN)?.[1] ?? null;
}

function readSubtitleBlock($, blockElement) {
  const subtitleBlock = $(blockElement);
  const siteFileId = (subtitleBlock.parent('a').attr('href') ?? '').match(
    SUBTITLE_LINK_PATTERN,
  )?.[1];
  const siteLanguageCode = toSiteLanguageCode(
    subtitleBlock.find('h5 img').first().attr('src'),
  );
  return {subtitleBlock, siteFileId, siteLanguageCode};
}

function toSearchHit({subtitleBlock, siteFileId, siteLanguageCode}) {
  const languageCode = toSubtitleLanguageCode(
    SITE_LANGUAGE_ALIASES.get(siteLanguageCode) ?? siteLanguageCode,
  );
  if (languageCode === null) {
    return null;
  }
  return {
    subtitleSource: SubtitleSource.TVSUBTITLES,
    siteFileId,
    languageCode,
    releaseNames: toHitReleaseNames([
      subtitleBlock.find('h5').first().text(),
      subtitleBlock.find('p[title="release"]').first().text(),
    ]),
    fileExtension: SubtitleFileExtension.SRT,
    isSitePack: false,
    isHearingImpaired: null,
    isForced: null,
    isMachineTranslated: null,
    isUploaderTrusted: null,
    isQuotaCostly: false,
    siteDownloadCount: toSiteCount(
      subtitleBlock.find('p[title="downloaded"]').first().text(),
    ),
    siteFps: null,
    siteFileUrl: null,
    siteCueCount: null,
    siteDurationMs: null,
    hashMatchVideoHashes: [],
    subtitleAliases: [],
  };
}

function hasLinkMatching($, isLinkWanted) {
  return $('a[href]')
    .toArray()
    .some(linkElement => isLinkWanted($(linkElement).attr('href') ?? ''));
}

function toSearchHits(response, {showId, catalogSeason}) {
  throwUnlessFound(response);
  const $ = loadTvsubtitlesPage(response.body);
  const seasonLink = toSeasonPath(showId, catalogSeason);
  if (!hasLinkMatching($, linkHref => linkHref === seasonLink)) {
    throw toUnavailableError('Episode page unreadable.');
  }
  const subtitleBlocks = $('div.subtitlen')
    .toArray()
    .map(blockElement => readSubtitleBlock($, blockElement));
  const readableBlocks = subtitleBlocks.filter(
    ({siteFileId, siteLanguageCode}) =>
      Boolean(siteFileId) && siteLanguageCode !== null,
  );
  if (
    readableBlocks.length === 0 &&
    (subtitleBlocks.length > 0 ||
      hasLinkMatching($, linkHref => ANY_SUBTITLE_LINK_PATTERN.test(linkHref)))
  ) {
    throw toUnavailableError('Subtitle blocks unreadable.');
  }
  return readableBlocks.map(toSearchHit).filter(Boolean);
}

function buildDownloadRequest({siteFileId}) {
  return buildRequest(
    `${TVSUBTITLES_SITE_URL}/download-${encodeURIComponent(siteFileId)}.html`,
    'text',
  );
}

function readScriptPath(pageText) {
  const scriptParts = new Map(
    [...pageText.matchAll(SCRIPT_PART_PATTERN)].map(([, partName, part]) => [
      partName,
      part.replace(SCRIPT_ESCAPE_PATTERN, '$1'),
    ]),
  );
  const partNames = pageText
    .match(SCRIPT_LOCATION_PATTERN)?.[1]
    .split('+')
    .map(partName => partName.trim());
  if (
    !partNames ||
    !partNames.every(
      partName =>
        SCRIPT_PART_NAME_PATTERN.test(partName) && scriptParts.has(partName),
    )
  ) {
    throw toUnavailableError('Download script unreadable.');
  }
  return partNames.map(partName => scriptParts.get(partName)).join('');
}

function toFileUrl(filePath) {
  if (!URL.canParse(filePath, `${TVSUBTITLES_SITE_URL}/`)) {
    throw toUnavailableError('Malformed download link.');
  }
  const fileUrl = parseSiteFileUrl(filePath, {
    isSiteHostname: hostname => hostname === TVSUBTITLES_HOSTNAME,
    pathPrefix: FILE_PATH_PREFIX,
    baseUrl: `${TVSUBTITLES_SITE_URL}/`,
  });
  if (fileUrl === null || !ZIP_FILE_PATTERN.test(fileUrl.pathname)) {
    throw toUnavailableError('Refused download link.');
  }
  return fileUrl;
}

function toFileNameHint(fileUrl) {
  try {
    return decodeURIComponent(fileUrl.pathname.split('/').at(-1));
  } catch {
    throw toUnavailableError('Malformed download file name.');
  }
}

function toDownloadLink(pageResponse) {
  throwUnlessFound(pageResponse);
  const fileUrl = toFileUrl(readScriptPath(String(pageResponse.body ?? '')));
  return {fileUrl: fileUrl.href, fileNameHint: toFileNameHint(fileUrl)};
}

function buildFileRequest({fileUrl}) {
  return buildRequest(fileUrl, 'bytes');
}

function toDownload(fileResponse, {fileNameHint}) {
  throwUnlessFound(fileResponse);
  return {
    fileBytes: fileResponse.body,
    fileNameHint:
      readSubtitleSourceFileName(fileResponse.headers) ?? fileNameHint,
    extractedEntryPath: null,
  };
}

export const tvsubtitlesMapping = {
  buildSearchRequest,
  findShowId,
  buildSeasonRequest,
  findEpisodeId,
  buildEpisodeRequest,
  toSearchHits,
  buildDownloadRequest,
  toDownloadLink,
  buildFileRequest,
  toDownload,
};
