import {Readable} from 'node:stream';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Maxios} from '@mepkg/maxios';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {SourceUnavailableError} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {tvsubtitlesClient} from '../../../src/lib/subtitle-sources/tvsubtitles/tvsubtitles-client.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {makeSearchQuery} from '../../helpers/subtitle-source-factories.js';

const DOWNLOAD_PAGE_FIXTURE =
  'subtitle-sources/tvsubtitles/download-309819.html';
const DOWNLOAD_PAGE_URL = 'https://www.tvsubtitles.net/download-309819.html';
const ZIP_URL =
  'https://www.tvsubtitles.net/files/Stranger%20Things_1x08_WebRip.NTb.en.zip';
const ZIP_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const ERROR_PAGE = '<html><body>File not found.</body></html>';

afterEach(() => {
  vi.restoreAllMocks();
});

function answerSite(answersByUrl) {
  return vi
    .spyOn(Maxios.prototype, 'request')
    .mockImplementation(async ({url}) => {
      const answer = answersByUrl[url];
      if (!answer) {
        throw new Error(`Unexpected request ${url}.`);
      }
      return {
        status: 200,
        headers: answer.headers,
        data: Readable.from([answer.body]),
      };
    });
}

describe('the TVsubtitles download chain', () => {
  const subtitleRef = {
    subtitleSource: SubtitleSource.TVSUBTITLES,
    siteFileId: '309819',
    siteFileUrl: null,
    catalogSeason: 1,
    catalogEpisode: 8,
  };

  it('reads the captured download page and fetches the zip it names', async () => {
    const requestSpy = answerSite({
      [DOWNLOAD_PAGE_URL]: {
        headers: {'content-type': 'text/html'},
        body: await readFixture(DOWNLOAD_PAGE_FIXTURE),
      },
      [ZIP_URL]: {
        headers: {'content-type': 'application/zip'},
        body: ZIP_BYTES,
      },
    });

    const download = await tvsubtitlesClient.downloadSubtitle(
      subtitleRef,
      null,
    );

    expect(Buffer.from(download.fileBytes).equals(ZIP_BYTES)).toBe(true);
    expect(download.fileNameHint).toBe(
      'Stranger Things_1x08_WebRip.NTb.en.zip',
    );
    expect(requestSpy.mock.calls.map(([{url}]) => url)).toEqual([
      DOWNLOAD_PAGE_URL,
      ZIP_URL,
    ]);
  });

  it('reads an HTML error page in place of the zip as an unavailable source', async () => {
    answerSite({
      [DOWNLOAD_PAGE_URL]: {
        headers: {'content-type': 'text/html'},
        body: await readFixture(DOWNLOAD_PAGE_FIXTURE),
      },
      [ZIP_URL]: {
        headers: {'content-type': 'text/html; charset=utf-8'},
        body: Buffer.from(ERROR_PAGE),
      },
    });

    const downloadError = await tvsubtitlesClient
      .downloadSubtitle(subtitleRef, null)
      .catch(error => error);

    expect(downloadError).toBeInstanceOf(SourceUnavailableError);
    expect(downloadError.cause.message).toBe(
      'Error page in place of the file.',
    );
  });
});

describe('tvsubtitlesClient', () => {
  it('names its subtitle source and takes no credential', () => {
    expect(tvsubtitlesClient.subtitleSource).toBe(SubtitleSource.TVSUBTITLES);
    expect(tvsubtitlesClient.credentialKinds).toEqual([]);
    expect(tvsubtitlesClient.canSearchWithoutCredential()).toBe(true);
    expect(tvsubtitlesClient.canDownloadWithoutCredential()).toBe(true);
  });

  it('searches by title, not by video hash', () => {
    expect(tvsubtitlesClient.isSearchHashSensitive).toBe(false);
  });

  it('declares the unknown-limit download budget', () => {
    expect(tvsubtitlesClient.downloadBudgets).toEqual([
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: 60000,
        requestMax: 10,
      },
    ]);
  });

  it('implements the search and download calls and no credential calls', () => {
    expect(tvsubtitlesClient.searchSubtitles).toBeTypeOf('function');
    expect(tvsubtitlesClient.downloadSubtitle).toBeTypeOf('function');
    expect(tvsubtitlesClient.checkCredential).toBeUndefined();
    expect(tvsubtitlesClient.readQuota).toBeUndefined();
  });

  it('is registered with the subtitle source clients', () => {
    expect(listSubtitleSourceClients()).toContain(tvsubtitlesClient);
  });

  it('answers a movie query with no hits and no request', async () => {
    expect(
      await tvsubtitlesClient.searchSubtitles(
        makeSearchQuery({
          videoId: 'tt0133093',
          imdbId: 'tt0133093',
          catalogTitle: 'The Matrix',
        }),
        null,
      ),
    ).toBeNull();
  });

  it('answers an episode query without a catalog title with no hits and no request', async () => {
    expect(
      await tvsubtitlesClient.searchSubtitles(
        makeSearchQuery({
          videoId: 'tt4574334:1:8',
          videoType: 'series',
          imdbId: 'tt4574334',
          catalogSeason: 1,
          catalogEpisode: 8,
          catalogTitle: null,
        }),
        null,
      ),
    ).toBeNull();
  });
});
