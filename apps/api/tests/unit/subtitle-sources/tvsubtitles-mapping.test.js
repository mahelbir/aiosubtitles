import {StatusCodes} from 'http-status-codes';
import {describe, expect, it} from 'vitest';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SubtitleFileExtension} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {subtitleSourceHitSchema} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {SourceUnavailableError} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {SUBTITLE_SOURCE_BROWSER_USER_AGENT} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {tvsubtitlesMapping} from '../../../src/lib/subtitle-sources/tvsubtitles/tvsubtitles-mapping.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {makeSearchQuery} from '../../helpers/subtitle-source-factories.js';

const SEASON_PAGE_FIXTURE = 'subtitle-sources/tvsubtitles/tvshow-2023-1.html';
const EPISODE_PAGE_FIXTURE = 'subtitle-sources/tvsubtitles/episode-61938.html';
const DOWNLOAD_PAGE_FIXTURE =
  'subtitle-sources/tvsubtitles/download-309819.html';
const SEARCH_PAGE_FIXTURE = 'subtitle-sources/tvsubtitles/search2.html';
const CAPTURE_EPISODE_REF = {showId: '2023', catalogSeason: 1};
const EMPTY_EPISODE_REF = {showId: '1', catalogSeason: 1};
const SITE_URL = 'https://www.tvsubtitles.net';
const ZIP_NAME = 'Stranger Things_1x08_WebRip.NTb.en.zip';
const ZIP_URL = `${SITE_URL}/files/Stranger%20Things_1x08_WebRip.NTb.en.zip`;
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const SEARCH_PAGE = `<!DOCTYPE html><html><head><title>TVsubtitles.net - Search results</title></head><body>
<div id="content"><div class="left"><div class="left_articles"><ul>
<li><div style="float:left"><a href="/tvshow-3301.html">Stranger Things: Tales from '85 (2025-2025)</a></div></li>
<li><div style="float:left"><a href="/tvshow-2023.html">Stranger Things (2016-2025)</a></div></li>
</ul></div></div>
<div class="smallboxitem"><a href="/tvshow-793-14.html"><div>&nbsp;&nbsp;Blue Bloods<div style="float:right">2010</div></div></a></div>
</div></body></html>`;
const OFFICE_SEARCH_PAGE = `<!DOCTYPE html><html><head><title>TVsubtitles.net - Search results</title></head><body>
<div id="content"><div class="left"><div class="left_articles"><ul>
<li><div style="float:left"><a href="/tvshow-101.html">The Office (UK) (2001-2003)</a></div></li>
<li><div style="float:left"><a href="/tvshow-102.html">The Office (US) (2005-2013)</a></div></li>
<li><div style="float:left"><a href="/tvshow-103.html">Doctor Who (2005) (2005-2022)</a></div></li>
</ul></div></div></div>
</body></html>`;
function toSearchPage(showTitles) {
  const showItems = showTitles
    .map(
      (showTitle, showIndex) =>
        `<li><div style="float:left"><a href="/tvshow-${showIndex + 1}.html">${showTitle}</a></div></li>`,
    )
    .join('\n');
  return `<!DOCTYPE html><html><head><title>TVsubtitles.net - Search results</title></head><body>
<div id="content"><div class="left"><div class="left_articles"><ul>
${showItems}
</ul></div></div></div>
</body></html>`;
}
const EMPTY_SEARCH_PAGE = `<!DOCTYPE html><html><head><title>TVsubtitles.net - Search results</title></head><body>
<div id="content"><div class="left"><div class="left_articles"><ul></ul></div></div></div>
</body></html>`;
const EMPTY_EPISODE_PAGE = `<!DOCTYPE html><html><head><title>TVsubtitles.net - Subtitles for Unknown Show episode 1x01 - "Pilot"</title></head><body>
<div class="left"><br clear=all><b>Subtitles for this episode:</b>
<br clear=all><a href="tvshow-1-1.html">Back to <b>Unknown Show</b></a></div>
</body></html>`;
const MAINTENANCE_PAGE = `<!DOCTYPE html><html><head><title>TVsubtitles.net - Maintenance</title></head><body>
<div class="left"><b>The site is down for maintenance.</b></div>
</body></html>`;
const CHALLENGE_PAGE =
  '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body></body></html>';
const episodeQuery = makeSearchQuery({
  videoId: 'tt4574334:1:8',
  videoType: 'series',
  imdbId: 'tt4574334',
  catalogSeason: 1,
  catalogEpisode: 8,
  catalogTitle: 'Stranger Things',
  languageCodes: SubtitleLanguage.values,
});

async function readPage(fixturePath) {
  return (await readFixture(fixturePath)).toString('utf8');
}

async function readDownloadPage(replacePage = pageText => pageText) {
  const pageBytes = await readFixture(DOWNLOAD_PAGE_FIXTURE);
  return Buffer.from(replacePage(pageBytes.toString('latin1')), 'latin1');
}

function toPageResponse(pageBody, status = StatusCodes.OK) {
  return {status, headers: {'content-type': 'text/html'}, body: pageBody};
}

function toMissingResponse() {
  return {status: StatusCodes.NOT_FOUND, headers: {}, body: null};
}

async function readCaptureHits(replacePage = pageText => pageText) {
  return tvsubtitlesMapping.toSearchHits(
    toPageResponse(replacePage(await readPage(EPISODE_PAGE_FIXTURE))),
    CAPTURE_EPISODE_REF,
  );
}

function toSubtitleRef(siteFileId) {
  return {
    subtitleSource: SubtitleSource.TVSUBTITLES,
    siteFileId,
    siteFileUrl: null,
    catalogSeason: 1,
    catalogEpisode: 8,
  };
}

function catchError(callback) {
  try {
    callback();
  } catch (error) {
    return error;
  }
  return null;
}

function findHit(hits, siteFileId) {
  return hits?.find(hit => hit.siteFileId === siteFileId);
}

function replaceTurkishFlag(siteLanguageCode) {
  return pageText =>
    pageText.replace(
      'images/flags/tr.gif" width="18" height="12" alt=""',
      `images/flags/${siteLanguageCode}.gif" width="18" height="12" alt=""`,
    );
}

function expectPageRequest(siteRequest, url) {
  expect(siteRequest).toMatchObject({
    subtitleSource: SubtitleSource.TVSUBTITLES,
    url,
    method: 'GET',
    responseType: 'text',
    acceptedStatuses: [],
    credentialId: null,
  });
  expect(siteRequest?.headers?.['User-Agent']).toBe(
    SUBTITLE_SOURCE_BROWSER_USER_AGENT,
  );
}

describe('tvsubtitlesMapping.buildSearchRequest', () => {
  it('posts the catalog title as the qs form field with a browser user agent', () => {
    const searchRequest = tvsubtitlesMapping.buildSearchRequest(episodeQuery);

    expect(searchRequest).toMatchObject({
      subtitleSource: SubtitleSource.TVSUBTITLES,
      url: `${SITE_URL}/search2.php`,
      method: 'POST',
      responseType: 'text',
      acceptedStatuses: [],
      credentialId: null,
    });
    expect(searchRequest?.headers?.['User-Agent']).toBe(
      SUBTITLE_SOURCE_BROWSER_USER_AGENT,
    );
    expect(searchRequest?.headers?.['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(new URLSearchParams(searchRequest?.body ?? '').get('qs')).toBe(
      'Stranger Things',
    );
  });

  it('asks nothing for a movie', () => {
    expect(
      tvsubtitlesMapping.buildSearchRequest(
        makeSearchQuery({
          videoId: 'tt0133093',
          imdbId: 'tt0133093',
          catalogTitle: 'The Matrix',
        }),
      ),
    ).toBeNull();
  });

  it('asks nothing without a catalog title', () => {
    expect(
      tvsubtitlesMapping.buildSearchRequest({
        ...episodeQuery,
        catalogTitle: null,
      }),
    ).toBeNull();
  });

  it('asks nothing for a series without an episode', () => {
    expect(
      tvsubtitlesMapping.buildSearchRequest({
        ...episodeQuery,
        videoId: 'tt4574334',
        catalogSeason: null,
        catalogEpisode: null,
      }),
    ).toBeNull();
  });
});

describe('tvsubtitlesMapping.findShowId', () => {
  it('picks the show whose title equals the catalog title', () => {
    expect(
      tvsubtitlesMapping.findShowId(toPageResponse(SEARCH_PAGE), episodeQuery),
    ).toBe('2023');
  });

  it.each([null, 2016])(
    'picks the show from the captured search page for year %s',
    async catalogYear => {
      expect(
        tvsubtitlesMapping.findShowId(
          toPageResponse(await readPage(SEARCH_PAGE_FIXTURE)),
          {...episodeQuery, catalogYear},
        ),
      ).toBe('2023');
    },
  );

  it('finds no show on the captured search page for a title it does not list', async () => {
    expect(
      tvsubtitlesMapping.findShowId(
        toPageResponse(await readPage(SEARCH_PAGE_FIXTURE)),
        {...episodeQuery, catalogTitle: 'Things', catalogYear: 2016},
      ),
    ).toBeNull();
  });

  it('treats the retired search page answer as an unavailable source', () => {
    expect(
      catchError(() =>
        tvsubtitlesMapping.findShowId(
          toPageResponse(
            '<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN"><html><head><title>404 Not Found</title></head><body><h1>Not Found</h1></body></html>',
          ),
          episodeQuery,
        ),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('compares the titles without case', () => {
    expect(
      tvsubtitlesMapping.findShowId(toPageResponse(SEARCH_PAGE), {
        ...episodeQuery,
        catalogTitle: 'STRANGER THINGS',
      }),
    ).toBe('2023');
  });

  it('finds no show when no title equals the catalog title', () => {
    expect(
      tvsubtitlesMapping.findShowId(toPageResponse(SEARCH_PAGE), {
        ...episodeQuery,
        catalogTitle: 'Stranger',
      }),
    ).toBeNull();
  });

  it('ignores the season links of the page sidebar', () => {
    expect(
      tvsubtitlesMapping.findShowId(toPageResponse(SEARCH_PAGE), {
        ...episodeQuery,
        catalogTitle: 'Blue Bloods',
      }),
    ).toBeNull();
  });

  it.each([
    [
      ['Shameless (2004-2013)', 'Shameless (US) (2011-2021)'],
      'Shameless',
      2011,
      '2',
    ],
    [
      ['Shameless (2004-2013)', 'Shameless (US) (2011-2021)'],
      'Shameless',
      2004,
      '1',
    ],
    [
      ['Shameless (2004-2013)', 'Shameless (US) (2011-2021)'],
      'Shameless (US)',
      null,
      '2',
    ],
    [['Shameless (UK) (2004-2013)'], 'Shameless (US)', 2004, null],
    [['Shameless (US) (2011-2021)'], 'Shameless', null, null],
    [
      ['Doctor Who (1963-1989)', 'Doctor Who (2005) (2005-2022)'],
      'Doctor Who',
      2005,
      '2',
    ],
    [
      ['Doctor Who (1963-1989)', 'Doctor Who (2005) (2005-2022)'],
      'Doctor Who',
      1963,
      '1',
    ],
    [['Doctor Who (2005) (2005-2022)'], 'Doctor Who', 1963, null],
    [['Doctor Who (1963-1989)'], 'Doctor Who', 2005, null],
    [['Doctor Who (1963-1989)'], 'Doctor Who', 1964, '1'],
    [['The Office (UK) (2001-2003)'], 'The Office (US)', 2005, null],
    [['The Office (UK) (2001-2003)'], 'The Office (US)', null, null],
    [['Severance (2022-)'], 'Severance', 2022, '1'],
    [['Who (US) Wants Out (2010-2011)'], 'Who Wants Out', 2010, null],
    [['Who (US) Wants Out (2010-2011)'], 'Who (US) Wants Out', 2010, '1'],
    [['Pokémon (1997-2023)'], 'Pokemon', 1997, null],
    [
      [
        'Battlestar Galactica (2004-2009)',
        'Battlestar Galactica (2003) (2003-2003)',
      ],
      'Battlestar Galactica',
      2003,
      '2',
    ],
    [
      [
        'Battlestar Galactica (2004-2009)',
        'Battlestar Galactica (2003) (2003-2003)',
      ],
      'Battlestar Galactica',
      2004,
      '1',
    ],
    [['Ask (Me) (2010-2011)'], 'Ask', 2010, null],
    [['Ask (Me) (2010-2011)'], 'Ask (Me)', 2010, '1'],
    [['Show (XX) (2010-2011)'], 'Show', 2010, null],
  ])(
    'among %j picks for %s of year %s the show %s',
    (showTitles, catalogTitle, catalogYear, showId) => {
      expect(
        tvsubtitlesMapping.findShowId(
          toPageResponse(toSearchPage(showTitles)),
          {...episodeQuery, catalogTitle, catalogYear},
        ),
      ).toBe(showId);
    },
  );

  it.each([
    ['The Office (US)', null, '102'],
    ['the office (uk)', null, '101'],
    ['The Office', 2005, '102'],
    ['The Office', 2001, '101'],
    ['The Office', null, null],
    ['The Office', 1995, null],
    ['Doctor Who', null, '103'],
    ['Doctor Who (2005)', null, '103'],
  ])(
    'matches %s of year %s to show %s after the tags are stripped',
    (catalogTitle, catalogYear, showId) => {
      expect(
        tvsubtitlesMapping.findShowId(toPageResponse(OFFICE_SEARCH_PAGE), {
          ...episodeQuery,
          catalogTitle,
          catalogYear,
        }),
      ).toBe(showId);
    },
  );

  it('prefers an exact title over a stripped one', () => {
    const pageHtml = OFFICE_SEARCH_PAGE.replace(
      '</ul>',
      '<li><div style="float:left"><a href="/tvshow-104.html">The Office (2019-2019)</a></div></li></ul>',
    );

    expect(
      tvsubtitlesMapping.findShowId(toPageResponse(pageHtml), {
        ...episodeQuery,
        catalogTitle: 'The Office',
        catalogYear: null,
      }),
    ).toBe('104');
  });

  it('finds no show on a search page without results', () => {
    expect(
      tvsubtitlesMapping.findShowId(
        toPageResponse(EMPTY_SEARCH_PAGE),
        episodeQuery,
      ),
    ).toBeNull();
  });

  it('treats a page that is not a TVsubtitles page as an unavailable source', () => {
    expect(
      catchError(() =>
        tvsubtitlesMapping.findShowId(
          toPageResponse(CHALLENGE_PAGE),
          episodeQuery,
        ),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('treats a missing search page as an unavailable source', () => {
    expect(
      catchError(() =>
        tvsubtitlesMapping.findShowId(toMissingResponse(), episodeQuery),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('tvsubtitlesMapping.buildSeasonRequest', () => {
  it('asks the season page of the found show', () => {
    expectPageRequest(
      tvsubtitlesMapping.buildSeasonRequest(
        tvsubtitlesMapping.findShowId(
          toPageResponse(SEARCH_PAGE),
          episodeQuery,
        ),
        episodeQuery,
      ),
      `${SITE_URL}/tvshow-2023-1.html`,
    );
  });
});

describe('tvsubtitlesMapping.findEpisodeId', () => {
  it('reads the episode page id from the row of the episode', async () => {
    expect(
      tvsubtitlesMapping.findEpisodeId(
        toPageResponse(await readPage(SEASON_PAGE_FIXTURE)),
        episodeQuery,
      ),
    ).toBe('61938');
  });

  it('matches the row by its season and episode numbers', async () => {
    expect(
      tvsubtitlesMapping.findEpisodeId(
        toPageResponse(await readPage(SEASON_PAGE_FIXTURE)),
        {...episodeQuery, videoId: 'tt4574334:1:1', catalogEpisode: 1},
      ),
    ).toBe('61931');
  });

  it('finds no episode when the season has no row for it', async () => {
    expect(
      tvsubtitlesMapping.findEpisodeId(
        toPageResponse(await readPage(SEASON_PAGE_FIXTURE)),
        {...episodeQuery, videoId: 'tt4574334:1:9', catalogEpisode: 9},
      ),
    ).toBeNull();
  });

  it('finds no episode when the season page is missing', () => {
    expect(
      tvsubtitlesMapping.findEpisodeId(toMissingResponse(), episodeQuery),
    ).toBeNull();
  });

  it('treats a season page without the episode table as an unavailable source', async () => {
    const pageHtml = (await readPage(SEASON_PAGE_FIXTURE)).replace(
      'id="table5"',
      'id="table6"',
    );

    expect(
      catchError(() =>
        tvsubtitlesMapping.findEpisodeId(
          toPageResponse(pageHtml),
          episodeQuery,
        ),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('treats an episode row whose page link changed as an unavailable source', async () => {
    const pageHtml = (await readPage(SEASON_PAGE_FIXTURE)).replace(
      'href="episode-61938.html"',
      'href="episodes-61938.html"',
    );

    expect(
      catchError(() =>
        tvsubtitlesMapping.findEpisodeId(
          toPageResponse(pageHtml),
          episodeQuery,
        ),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('treats a page that is not a TVsubtitles page as an unavailable source', () => {
    expect(
      catchError(() =>
        tvsubtitlesMapping.findEpisodeId(
          toPageResponse(CHALLENGE_PAGE),
          episodeQuery,
        ),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('tvsubtitlesMapping.buildEpisodeRequest', () => {
  it('asks the episode page by the id the season row gave', async () => {
    expectPageRequest(
      tvsubtitlesMapping.buildEpisodeRequest(
        tvsubtitlesMapping.findEpisodeId(
          toPageResponse(await readPage(SEASON_PAGE_FIXTURE)),
          episodeQuery,
        ),
      ),
      `${SITE_URL}/episode-61938.html`,
    );
  });
});

describe('tvsubtitlesMapping.toSearchHits', () => {
  it('turns every subtitle block of the episode page into one hit', async () => {
    expect((await readCaptureHits())?.map(hit => hit.siteFileId)).toEqual([
      '309819',
      '316777',
      '84658',
    ]);
  });

  it('maps a block to a keyless srt hit with its release and download count', async () => {
    expect(findHit(await readCaptureHits(), '309819')).toEqual({
      subtitleSource: SubtitleSource.TVSUBTITLES,
      siteFileId: '309819',
      languageCode: SubtitleLanguage.ENG,
      releaseNames: ['Stranger Things 1x08 (WEB.NTb)', 'NTb'],
      fileExtension: SubtitleFileExtension.SRT,
      isSitePack: false,
      isHearingImpaired: null,
      isForced: null,
      isMachineTranslated: null,
      isUploaderTrusted: null,
      isQuotaCostly: false,
      siteDownloadCount: 4702,
      siteFps: null,
      siteFileUrl: null,
      siteCueCount: null,
      siteDurationMs: null,
      hashMatchVideoHashes: [],
      subtitleAliases: [],
    });
  });

  it('keeps the heading alone when the release is empty', async () => {
    expect(findHit(await readCaptureHits(), '316777')).toMatchObject({
      languageCode: SubtitleLanguage.FRE,
      releaseNames: ['Stranger Things 1x08 (WEB)'],
      siteDownloadCount: 704,
    });
  });

  it('reads the language from the flag image file, since its alt is empty', async () => {
    expect(findHit(await readCaptureHits(), '84658')).toMatchObject({
      languageCode: SubtitleLanguage.TUR,
      siteDownloadCount: 641,
    });
  });

  it.each([
    ['br', SubtitleLanguage.POB],
    ['ua', SubtitleLanguage.UKR],
    ['gr', SubtitleLanguage.ELL],
    ['cn', SubtitleLanguage.ZHO],
    ['jp', SubtitleLanguage.JPN],
    ['cz', SubtitleLanguage.CES],
  ])('maps the site flag %s to %s', async (siteLanguageCode, languageCode) => {
    expect(
      findHit(
        await readCaptureHits(replaceTurkishFlag(siteLanguageCode)),
        '84658',
      )?.languageCode,
    ).toBe(languageCode);
  });

  it('drops a block whose language does not map', async () => {
    const hits = await readCaptureHits(replaceTurkishFlag('zz'));

    expect(hits?.map(hit => hit.siteFileId)).toEqual(['309819', '316777']);
  });

  it('gives hits that pass the hit schema', async () => {
    const hits = await readCaptureHits();

    expect(hits).toHaveLength(3);
    for (const hit of hits ?? []) {
      expect(subtitleSourceHitSchema.safeParse(hit).success).toBe(true);
    }
  });

  it('answers an episode page without subtitles with no hits', () => {
    expect(
      tvsubtitlesMapping.toSearchHits(
        toPageResponse(EMPTY_EPISODE_PAGE),
        EMPTY_EPISODE_REF,
      ),
    ).toEqual([]);
  });

  it('answers an empty episode page without its subtitle heading with no hits', () => {
    expect(
      tvsubtitlesMapping.toSearchHits(
        toPageResponse(
          EMPTY_EPISODE_PAGE.replace('Subtitles for this episode:', ''),
        ),
        EMPTY_EPISODE_REF,
      ),
    ).toEqual([]);
  });

  it.each([
    ['another show', {showId: '2', catalogSeason: 1}],
    ['another season', {showId: '1', catalogSeason: 2}],
  ])(
    'treats an episode page whose season link names %s as an unavailable source',
    (_, episodeRef) => {
      expect(
        catchError(() =>
          tvsubtitlesMapping.toSearchHits(
            toPageResponse(EMPTY_EPISODE_PAGE),
            episodeRef,
          ),
        ),
      ).toBeInstanceOf(SourceUnavailableError);
    },
  );

  it('ignores a sidebar season link of another show', () => {
    const pageHtml = EMPTY_EPISODE_PAGE.replace(
      '</body>',
      '<div class="smallboxitem"><a href="/tvshow-793-14.html">Blue Bloods</a></div></body>',
    );

    expect(
      catchError(() =>
        tvsubtitlesMapping.toSearchHits(toPageResponse(pageHtml), {
          showId: '793',
          catalogSeason: 14,
        }),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('reads the subtitle blocks of an episode page without its subtitle heading', async () => {
    const hits = await readCaptureHits(pageText =>
      pageText.replace('Subtitles for this episode:', ''),
    );

    expect(hits?.map(hit => hit.siteFileId)).toEqual([
      '309819',
      '316777',
      '84658',
    ]);
  });

  it('treats subtitle blocks whose page links changed as an unavailable source', async () => {
    const pageHtml = (await readPage(EPISODE_PAGE_FIXTURE)).replaceAll(
      'href="/subtitle-',
      'href="/subtitles-',
    );

    expect(
      catchError(() =>
        tvsubtitlesMapping.toSearchHits(
          toPageResponse(pageHtml),
          CAPTURE_EPISODE_REF,
        ),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('treats subtitle blocks whose flag images changed as an unavailable source', async () => {
    const pageHtml = (await readPage(EPISODE_PAGE_FIXTURE)).replaceAll(
      'images/flags/',
      'images/flag-icons/',
    );

    expect(
      catchError(() =>
        tvsubtitlesMapping.toSearchHits(
          toPageResponse(pageHtml),
          CAPTURE_EPISODE_REF,
        ),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('treats a page that is not a TVsubtitles page as an unavailable source', () => {
    expect(
      catchError(() =>
        tvsubtitlesMapping.toSearchHits(
          toPageResponse(CHALLENGE_PAGE),
          CAPTURE_EPISODE_REF,
        ),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('treats a missing episode page as an unavailable source', () => {
    expect(
      catchError(() =>
        tvsubtitlesMapping.toSearchHits(
          toMissingResponse(),
          CAPTURE_EPISODE_REF,
        ),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('treats a maintenance page of the site as an unavailable source', () => {
    expect(
      catchError(() =>
        tvsubtitlesMapping.toSearchHits(
          toPageResponse(MAINTENANCE_PAGE),
          CAPTURE_EPISODE_REF,
        ),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('treats an episode page without its season link as an unavailable source', async () => {
    const pageHtml = (await readPage(EPISODE_PAGE_FIXTURE)).replaceAll(
      'href="tvshow-2023-1.html"',
      'href="index.html"',
    );

    expect(
      catchError(() =>
        tvsubtitlesMapping.toSearchHits(
          toPageResponse(pageHtml),
          CAPTURE_EPISODE_REF,
        ),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('treats subtitle links whose blocks were renamed as an unavailable source', async () => {
    const pageHtml = (await readPage(EPISODE_PAGE_FIXTURE)).replaceAll(
      'class="subtitlen"',
      'class="subtitle-row"',
    );

    expect(
      catchError(() =>
        tvsubtitlesMapping.toSearchHits(
          toPageResponse(pageHtml),
          CAPTURE_EPISODE_REF,
        ),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('tvsubtitlesMapping.buildDownloadRequest', () => {
  it('asks the download page of a hit as bytes with a browser user agent', async () => {
    const [firstHit] = (await readCaptureHits()) ?? [];
    const downloadRequest = tvsubtitlesMapping.buildDownloadRequest(
      toSubtitleRef(firstHit?.siteFileId),
    );

    expect(downloadRequest).toMatchObject({
      subtitleSource: SubtitleSource.TVSUBTITLES,
      url: `${SITE_URL}/download-309819.html`,
      method: 'GET',
      responseType: 'bytes',
      acceptedStatuses: [],
      credentialId: null,
    });
    expect(downloadRequest?.headers?.['User-Agent']).toBe(
      SUBTITLE_SOURCE_BROWSER_USER_AGENT,
    );
  });
});

describe('tvsubtitlesMapping.toDownloadLink', () => {
  it('joins the script parts into the zip url on the site', async () => {
    expect(
      tvsubtitlesMapping.toDownloadLink(
        toPageResponse(await readDownloadPage()),
      ),
    ).toEqual({fileUrl: ZIP_URL, fileNameHint: ZIP_NAME});
  });

  it('joins the parts in the order the location lists them', async () => {
    const pageBody = await readDownloadPage(pageText =>
      pageText
        .replace("var s1= 'fil';", '')
        .replace("var s3= 'tr';", "var s3= 'tr'; var s1= 'fil';"),
    );

    expect(
      tvsubtitlesMapping.toDownloadLink(toPageResponse(pageBody))?.fileUrl,
    ).toBe(ZIP_URL);
  });

  it('reads an escaped quote inside a part', async () => {
    const pageBody = await readDownloadPage(pageText =>
      pageText.replace("'anger Things_", "'anger Thing\\'s_"),
    );

    expect(tvsubtitlesMapping.toDownloadLink(toPageResponse(pageBody))).toEqual(
      {
        fileUrl: `${SITE_URL}/files/Stranger%20Thing's_1x08_WebRip.NTb.en.zip`,
        fileNameHint: "Stranger Thing's_1x08_WebRip.NTb.en.zip",
      },
    );
  });

  it('reads the page as latin1', async () => {
    const pageBody = await readDownloadPage(pageText =>
      pageText.replace("'anger Things_", "'anger Théings_"),
    );

    expect(tvsubtitlesMapping.toDownloadLink(toPageResponse(pageBody))).toEqual(
      {
        fileUrl: `${SITE_URL}/files/Stranger%20Th%C3%A9ings_1x08_WebRip.NTb.en.zip`,
        fileNameHint: 'Stranger Théings_1x08_WebRip.NTb.en.zip',
      },
    );
  });

  it.each([
    [
      'another host',
      "var s1= 'fil';",
      "var s1= 'https://files.example.com/fil';",
    ],
    [
      'a host that only starts like the site',
      "var s1= 'fil';",
      "var s1= 'https://www.tvsubtitles.net.example.com/fil';",
    ],
    [
      'a protocol-relative host',
      "var s1= 'fil';",
      "var s1= '//files.example.com/fil';",
    ],
    [
      'plain http',
      "var s1= 'fil';",
      "var s1= 'http://www.tvsubtitles.net/fil';",
    ],
    [
      'a path out of the files folder',
      "var s2= 'es/S';",
      "var s2= 'es/../../S';",
    ],
    ['a file that is no zip', "en.zip';", "en.rar';"],
    ['a malformed address', "var s1= 'fil';", "var s1= 'https://[fil';"],
    ['a malformed file name', "var s3= 'tr';", "var s3= 'tr%';"],
    [
      'a user name',
      "var s1= 'fil';",
      "var s1= 'https://user@www.tvsubtitles.net/fil';",
    ],
    [
      'another port',
      "var s1= 'fil';",
      "var s1= 'https://www.tvsubtitles.net:8443/fil';",
    ],
    ['a backslash host', "var s1= 'fil';", "var s1= '\\\\\\\\evil.com/fil';"],
    [
      'a trailing-dot host',
      "var s1= 'fil';",
      "var s1= 'https://www.tvsubtitles.net./fil';",
    ],
  ])(
    'treats a link to %s as an unavailable source',
    async (_, searchText, replaceText) => {
      const pageBody = await readDownloadPage(pageText =>
        pageText.replace(searchText, replaceText),
      );

      expect(
        catchError(() =>
          tvsubtitlesMapping.toDownloadLink(toPageResponse(pageBody)),
        ),
      ).toBeInstanceOf(SourceUnavailableError);
    },
  );

  it('treats a location naming an unassigned part as an unavailable source', async () => {
    const pageBody = await readDownloadPage(pageText =>
      pageText.replace('s1+s2+s3+s4;', 's1+s2+s3+s5;'),
    );

    expect(
      catchError(() =>
        tvsubtitlesMapping.toDownloadLink(toPageResponse(pageBody)),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('treats a page without the location script as an unavailable source', async () => {
    const pageBody = await readDownloadPage(pageText =>
      pageText.replace('document.location =', 'window.status ='),
    );

    expect(
      catchError(() =>
        tvsubtitlesMapping.toDownloadLink(toPageResponse(pageBody)),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('treats a missing download page as an unavailable source', () => {
    expect(
      catchError(() => tvsubtitlesMapping.toDownloadLink(toMissingResponse())),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('tvsubtitlesMapping.buildFileRequest', () => {
  it('asks the zip as bytes with a browser user agent', () => {
    const fileRequest = tvsubtitlesMapping.buildFileRequest({
      fileUrl: ZIP_URL,
      fileNameHint: ZIP_NAME,
    });

    expect(fileRequest).toMatchObject({
      subtitleSource: SubtitleSource.TVSUBTITLES,
      url: ZIP_URL,
      method: 'GET',
      responseType: 'bytes',
      acceptedStatuses: [],
      credentialId: null,
    });
    expect(fileRequest?.headers?.['User-Agent']).toBe(
      SUBTITLE_SOURCE_BROWSER_USER_AGENT,
    );
  });
});

describe('tvsubtitlesMapping.toDownload', () => {
  it('hands the zip bytes on whole, named after the link, for the store to expand', () => {
    expect(
      tvsubtitlesMapping.toDownload(
        {
          status: StatusCodes.OK,
          headers: {'content-type': 'application/zip'},
          body: ZIP_BYTES,
        },
        {fileUrl: ZIP_URL, fileNameHint: ZIP_NAME},
      ),
    ).toEqual({
      fileBytes: ZIP_BYTES,
      fileNameHint: ZIP_NAME,
      extractedEntryPath: null,
    });
  });

  it('prefers the file name the response gives', () => {
    expect(
      tvsubtitlesMapping.toDownload(
        {
          status: StatusCodes.OK,
          headers: {
            'content-type': 'application/zip',
            'content-disposition': 'attachment; filename="served-name.zip"',
          },
          body: ZIP_BYTES,
        },
        {fileUrl: ZIP_URL, fileNameHint: ZIP_NAME},
      )?.fileNameHint,
    ).toBe('served-name.zip');
  });

  it('treats a missing zip as an unavailable source', () => {
    expect(
      catchError(() =>
        tvsubtitlesMapping.toDownload(toMissingResponse(), {
          fileUrl: ZIP_URL,
          fileNameHint: ZIP_NAME,
        }),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});
