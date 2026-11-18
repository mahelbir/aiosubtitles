import {StatusCodes} from 'http-status-codes';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {gestdownClient} from '../../../src/lib/subtitle-sources/gestdown/gestdown-client.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {requestSubtitleSource} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {makeSearchQuery} from '../../helpers/subtitle-source-factories.js';

vi.mock(
  '../../../src/lib/subtitle-sources/subtitle-source-request.js',
  async importOriginal => ({
    ...(await importOriginal()),
    requestSubtitleSource: vi.fn(),
  }),
);

afterEach(() => {
  vi.resetAllMocks();
});

const SHOW_ID = '3kq7Fixture0Show00000A';
const PACK_ID = 'sp_5RtyFixture0Pack0001_ep_3';
const episodeQuery = makeSearchQuery({
  videoId: 'tt0903747:2:3',
  videoType: 'series',
  imdbId: 'tt0903747',
  catalogSeason: 2,
  catalogEpisode: 3,
  tvdbId: '81189',
  languageCodes: ['pob'],
});

async function readBodies() {
  const [showsBody, subtitlesBody] = await Promise.all([
    readFixture('subtitle-sources/gestdown/shows-external-tvdb.json'),
    readFixture('subtitle-sources/gestdown/subtitles-get.json'),
  ]);
  return {showsBody, subtitlesBody};
}

function toOk(body) {
  return {status: StatusCodes.OK, headers: {}, body};
}

function readRequestedUrls() {
  return requestSubtitleSource.mock.calls.map(([request]) => request.url);
}

describe('gestdownClient', () => {
  it('names its subtitle source and takes no credential', () => {
    expect(gestdownClient.subtitleSource).toBe(SubtitleSource.GESTDOWN);
    expect(gestdownClient.credentialKinds).toEqual([]);
    expect(gestdownClient.canSearchWithoutCredential()).toBe(true);
    expect(gestdownClient.canDownloadWithoutCredential()).toBe(true);
  });

  it('searches by id, not by video hash', () => {
    expect(gestdownClient.isSearchHashSensitive).toBe(false);
  });

  it('declares the shared server download budget', () => {
    expect(gestdownClient.downloadBudgets).toEqual([
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: 60000,
        requestMax: 10,
      },
    ]);
  });

  it('implements the search and download calls and no credential calls', () => {
    expect(gestdownClient.searchSubtitles).toBeTypeOf('function');
    expect(gestdownClient.downloadSubtitle).toBeTypeOf('function');
    expect(gestdownClient.checkCredential).toBeUndefined();
    expect(gestdownClient.readQuota).toBeUndefined();
  });

  it('is registered with the subtitle source clients', () => {
    expect(listSubtitleSourceClients()).toContain(gestdownClient);
  });

  it('answers a movie with no hits and no request', async () => {
    await expect(
      gestdownClient.searchSubtitles(
        makeSearchQuery({videoId: 'tt0133093', tvdbId: '169'}),
        null,
      ),
    ).resolves.toEqual([]);
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });

  it('answers a series without a tvdb id with no hits and no request', async () => {
    await expect(
      gestdownClient.searchSubtitles({...episodeQuery, tvdbId: null}, null),
    ).resolves.toEqual([]);
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });

  it('looks the show up, then asks its episode once for one language', async () => {
    const {showsBody, subtitlesBody} = await readBodies();
    requestSubtitleSource
      .mockResolvedValueOnce(toOk(showsBody))
      .mockResolvedValueOnce(toOk(subtitlesBody));
    const hits = await gestdownClient.searchSubtitles(episodeQuery, null);
    expect(requestSubtitleSource).toHaveBeenCalledTimes(2);
    const [showUrl, subtitlesUrl] = readRequestedUrls();
    expect(showUrl).toBe('https://api.gestdown.info/shows/external/tvdb/81189');
    expect(subtitlesUrl.toLowerCase()).toBe(
      `https://api.gestdown.info/subtitles/get/${SHOW_ID}/2/3/pt-br`.toLowerCase(),
    );
    expect(hits.map(hit => hit.siteFileId)).toContain(PACK_ID);
    expect(hits.every(hit => hit.languageCode === 'pob')).toBe(true);
  });

  it('passes the abort signal to every request', async () => {
    const {showsBody, subtitlesBody} = await readBodies();
    const {signal} = new AbortController();
    requestSubtitleSource
      .mockResolvedValueOnce(toOk(showsBody))
      .mockResolvedValueOnce(toOk(subtitlesBody));
    await gestdownClient.searchSubtitles(episodeQuery, null, {signal});
    expect(requestSubtitleSource).toHaveBeenCalledTimes(2);
    for (const [request] of requestSubtitleSource.mock.calls) {
      expect(request.signal).toBe(signal);
    }
  });

  it('stops after the show lookup when the site does not know the show', async () => {
    requestSubtitleSource.mockResolvedValueOnce({
      status: StatusCodes.NOT_FOUND,
      headers: {},
      body: null,
    });
    await expect(
      gestdownClient.searchSubtitles(episodeQuery, null),
    ).resolves.toEqual([]);
    expect(requestSubtitleSource).toHaveBeenCalledTimes(1);
  });

  it('reads a language the site does not know (423) as no hits, not an error', async () => {
    const {showsBody} = await readBodies();
    requestSubtitleSource
      .mockResolvedValueOnce(toOk(showsBody))
      .mockResolvedValueOnce({
        status: StatusCodes.LOCKED,
        headers: {},
        body: null,
      });
    await expect(
      gestdownClient.searchSubtitles(episodeQuery, null),
    ).resolves.toEqual([]);
  });

  it('looks the show up once and keeps the hits of a language beside one the site does not know', async () => {
    const {showsBody, subtitlesBody} = await readBodies();
    requestSubtitleSource.mockImplementation(async ({url}) => {
      if (url.includes('/shows/')) {
        return toOk(showsBody);
      }
      return url.toLowerCase().endsWith('/pt-br')
        ? toOk(subtitlesBody)
        : {status: StatusCodes.LOCKED, headers: {}, body: null};
    });
    const hits = await gestdownClient.searchSubtitles(
      {...episodeQuery, languageCodes: ['tur', 'pob']},
      null,
    );
    expect(requestSubtitleSource).toHaveBeenCalledTimes(3);
    expect(
      readRequestedUrls().filter(url => url.includes('/shows/')),
    ).toHaveLength(1);
    expect(hits).toHaveLength(4);
    expect(hits.every(hit => hit.languageCode === 'pob')).toBe(true);
  });

  it('downloads a season pack episode by the id the site gave, as one file', async () => {
    const fileBytes = Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nOi\n');
    requestSubtitleSource.mockResolvedValueOnce({
      status: StatusCodes.OK,
      headers: {'content-type': 'text/srt'},
      body: fileBytes,
    });
    const download = await gestdownClient.downloadSubtitle(
      {
        subtitleSource: SubtitleSource.GESTDOWN,
        siteFileId: PACK_ID,
        siteFileUrl: null,
        catalogSeason: 2,
        catalogEpisode: 3,
        isSitePack: false,
      },
      null,
    );
    expect(readRequestedUrls()).toEqual([
      `https://api.gestdown.info/subtitles/download/${PACK_ID}`,
    ]);
    expect(download).toEqual({
      fileBytes,
      fileNameHint: null,
      extractedEntryPath: null,
    });
  });
});
