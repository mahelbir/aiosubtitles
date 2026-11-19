import {StatusCodes} from 'http-status-codes';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  animetoshoClient,
  createAnimetoshoClient,
} from '../../../src/lib/subtitle-sources/animetosho/animetosho-client.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {
  SourceRateLimitError,
  SourceUnavailableError,
} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
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

const FEED_URL = 'https://feed.animetosho.net/json?aid=18886';
const FRIEREN_SECOND_SEASON_AID = '18886';
const EPISODE_FIVE_TORRENT_IDS = [
  '612661',
  '612662',
  '612663',
  '603969',
  '602208',
];
const SAMPLE_ATTACHMENT_URL =
  'https://storage.animetosho.net/attachments/002bd/e25.xz?filename=%5B9volt%5D+Sousou+no+Frieren+-+38+%28S02E10%29+%28WEB+1080p+HEVC+EAC-3%29+%5B3DB7B2CE%5D_track3.eng.ass.xz';
const kitsuEpisodeQuery = makeSearchQuery({
  videoId: 'kitsu:7442:5',
  videoType: 'series',
  imdbId: 'tt2560140',
  kitsuId: '7442',
  catalogSeason: 2,
  catalogEpisode: 17,
  kitsuEpisode: 5,
  languageCodes: ['eng'],
});
const subtitleRef = {
  subtitleSource: SubtitleSource.ANIMETOSHO,
  siteFileId: '3092648',
  siteFileUrl: SAMPLE_ATTACHMENT_URL,
  catalogSeason: 2,
  catalogEpisode: 17,
};

function toOk(body) {
  return {status: StatusCodes.OK, headers: {}, body};
}

function makeUnavailableError() {
  return new SourceUnavailableError({
    subtitleSource: SubtitleSource.ANIMETOSHO,
    cause: new Error('ECONNRESET'),
  });
}

function makeRateLimitError() {
  return new SourceRateLimitError({
    subtitleSource: SubtitleSource.ANIMETOSHO,
    retryAfterMs: 60000,
  });
}

function readTorrentId(url) {
  const {searchParams} = new URL(url);
  return searchParams.get('show') === 'torrent' ? searchParams.get('id') : null;
}

function readOpenedTorrentIds() {
  return requestSubtitleSource.mock.calls
    .map(([request]) => readTorrentId(request.url))
    .filter(Boolean);
}

function toTorrentBody(feedItem) {
  return {
    id: feedItem.id,
    torrent_name: feedItem.torrent_name,
    anidb_aid: feedItem.anidb_aid,
    is_batch: false,
    files: [
      {
        id: feedItem.id * 10,
        filename: `${feedItem.torrent_name}.mkv`,
        is_archive: false,
        attachments: [
          {
            id: feedItem.id * 10 + 3,
            type: 'subtitle',
            size: null,
            url: `https://storage.animetosho.net/attachments/0fixt/${feedItem.id}.xz?filename=Fixture_track3.eng.ass.xz`,
            info: {
              default: true,
              forced: false,
              format: 'ASS',
              language_code: 'eng',
              name: 'English',
              tracknum: 3,
            },
          },
        ],
      },
    ],
  };
}

async function answerFeed({feedBody, answerTorrent} = {}) {
  const sampleFeed =
    feedBody ??
    (await readFixture(
      'subtitle-sources/animetosho/sample-net-feed-json-q.json',
    ));
  const feedItemById = new Map(
    (Array.isArray(sampleFeed) ? sampleFeed : []).map(feedItem => [
      String(feedItem.id),
      feedItem,
    ]),
  );
  requestSubtitleSource.mockImplementation(async ({url}) => {
    const torrentId = readTorrentId(url);
    if (torrentId === null) {
      return toOk(sampleFeed);
    }
    if (answerTorrent) {
      return answerTorrent(torrentId);
    }
    return toOk(toTorrentBody(feedItemById.get(torrentId)));
  });
}

function createClientWithAid(anidbId = FRIEREN_SECOND_SEASON_AID) {
  const readAnidbId = vi.fn(async () => anidbId);
  return {readAnidbId, client: createAnimetoshoClient({readAnidbId})};
}

describe('animetoshoClient', () => {
  it('names its subtitle source and takes no credential', () => {
    expect(animetoshoClient.subtitleSource).toBe(SubtitleSource.ANIMETOSHO);
    expect(animetoshoClient.credentialKinds).toEqual([]);
    expect(animetoshoClient.canSearchWithoutCredential?.()).toBe(true);
    expect(animetoshoClient.canDownloadWithoutCredential?.()).toBe(true);
  });

  it('searches by id, not by video hash', () => {
    expect(animetoshoClient.isSearchHashSensitive).toBe(false);
  });

  it('declares the shared server download budget', () => {
    expect(animetoshoClient.downloadBudgets).toEqual([
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: 60000,
        requestMax: 10,
      },
    ]);
  });

  it('implements the search and download calls and no credential calls', () => {
    expect(animetoshoClient.searchSubtitles).toBeTypeOf('function');
    expect(animetoshoClient.downloadSubtitle).toBeTypeOf('function');
    expect(animetoshoClient.checkCredential).toBeUndefined();
    expect(animetoshoClient.readQuota).toBeUndefined();
  });

  it('is registered with the subtitle source clients', () => {
    expect(listSubtitleSourceClients()).toContain(animetoshoClient);
  });

  it('answers an IMDb video with no hits, no AniDB lookup and no request', async () => {
    const {readAnidbId, client} = createClientWithAid();

    await expect(
      client.searchSubtitles?.(
        makeSearchQuery({
          videoId: 'tt2560140:2:5',
          videoType: 'series',
          imdbId: 'tt2560140',
          catalogSeason: 2,
          catalogEpisode: 5,
        }),
        null,
      ),
    ).resolves.toBeNull();
    expect(readAnidbId).not.toHaveBeenCalled();
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });

  it('searches an anime movie by its AniDB id and opens only releases tied to no episode', async () => {
    const {readAnidbId, client} = createClientWithAid();
    await answerFeed({
      feedBody: [
        {
          id: 990011,
          anidb_aid: 18886,
          torrent_name: '[Fixture] Sousou no Frieren Movie (BD 1080p HEVC)',
        },
        {
          id: 990012,
          anidb_aid: 18886,
          torrent_name: '[Fixture] Sousou no Frieren - 05 (1080p)',
        },
      ],
    });

    const hits = await client.searchSubtitles?.(
      makeSearchQuery({
        videoId: 'kitsu:7442',
        videoType: 'movie',
        imdbId: null,
        kitsuId: '7442',
        languageCodes: ['eng'],
      }),
      null,
    );

    expect(readAnidbId).toHaveBeenCalledWith('7442');
    expect(requestSubtitleSource.mock.calls[0]?.[0]?.url).toBe(FEED_URL);
    expect(readOpenedTorrentIds()).toEqual(['990011']);
    expect(hits).toMatchObject([{siteFileId: '9900113'}]);
  });

  it('answers an anime without an AniDB id with no hits and no request', async () => {
    const {readAnidbId, client} = createClientWithAid(null);

    await expect(
      client.searchSubtitles?.(kitsuEpisodeQuery, null),
    ).resolves.toEqual([]);
    expect(readAnidbId).toHaveBeenCalledWith('7442');
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });

  it('fails the search when the AniDB lookup fails, rather than answering no hits', async () => {
    const readAnidbId = vi.fn(async () => {
      throw makeUnavailableError();
    });
    const client = createAnimetoshoClient({readAnidbId});

    await expect(
      client.searchSubtitles?.(kitsuEpisodeQuery, null),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });

  it('asks the feed by AniDB id, then opens only torrents of Kitsu episode 5', async () => {
    const {readAnidbId, client} = createClientWithAid();
    await answerFeed();

    const hits = await client.searchSubtitles?.(kitsuEpisodeQuery, null);

    expect(readAnidbId).toHaveBeenCalledWith('7442');
    expect(requestSubtitleSource.mock.calls[0]?.[0]?.url).toBe(FEED_URL);
    const openedTorrentIds = readOpenedTorrentIds();
    expect(openedTorrentIds).toContain('602208');
    expect(
      openedTorrentIds.every(torrentId =>
        EPISODE_FIVE_TORRENT_IDS.includes(torrentId),
      ),
    ).toBe(true);
    expect(hits).toHaveLength(openedTorrentIds.length);
    expect(hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subtitleSource: SubtitleSource.ANIMETOSHO,
          siteFileId: '6022083',
          languageCode: 'eng',
        }),
      ]),
    );
  });

  it('answers an empty feed with no hits and opens no torrent', async () => {
    const {client} = createClientWithAid();
    await answerFeed({feedBody: []});

    await expect(
      client.searchSubtitles?.(kitsuEpisodeQuery, null),
    ).resolves.toEqual([]);
    expect(requestSubtitleSource).toHaveBeenCalledTimes(1);
  });

  it('fails the search when the feed body is no list', async () => {
    const {client} = createClientWithAid();
    await answerFeed({feedBody: {error: 'Unknown parameter'}});

    await expect(
      client.searchSubtitles?.(kitsuEpisodeQuery, null),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
    expect(readOpenedTorrentIds()).toEqual([]);
  });

  it('keeps the hits of the other torrents when one torrent detail fails', async () => {
    const {client} = createClientWithAid();
    const feedBody = await readFixture(
      'subtitle-sources/animetosho/sample-net-feed-json-q.json',
    );
    const feedItemById = new Map(
      feedBody.map(feedItem => [String(feedItem.id), feedItem]),
    );
    let torrentCallCount = 0;
    await answerFeed({
      feedBody,
      answerTorrent: async torrentId => {
        torrentCallCount += 1;
        if (torrentCallCount === 1) {
          throw makeUnavailableError();
        }
        return toOk(toTorrentBody(feedItemById.get(torrentId)));
      },
    });

    const hits = await client.searchSubtitles?.(kitsuEpisodeQuery, null);

    expect(torrentCallCount).toBeGreaterThan(1);
    expect(hits).toHaveLength(torrentCallCount - 1);
  });

  it('fails the search when every torrent detail fails', async () => {
    const {client} = createClientWithAid();
    await answerFeed({
      answerTorrent: async () => {
        throw makeUnavailableError();
      },
    });

    await expect(
      client.searchSubtitles?.(kitsuEpisodeQuery, null),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
    expect(readOpenedTorrentIds().length).toBeGreaterThan(0);
  });

  it('keeps the hits of the other torrents when one torrent detail is rate limited', async () => {
    const {client} = createClientWithAid();
    const feedBody = await readFixture(
      'subtitle-sources/animetosho/sample-net-feed-json-q.json',
    );
    const feedItemById = new Map(
      feedBody.map(feedItem => [String(feedItem.id), feedItem]),
    );
    let torrentCallCount = 0;
    await answerFeed({
      feedBody,
      answerTorrent: async torrentId => {
        torrentCallCount += 1;
        if (torrentCallCount === 1) {
          throw makeRateLimitError();
        }
        return toOk(toTorrentBody(feedItemById.get(torrentId)));
      },
    });

    const hits = await client.searchSubtitles?.(kitsuEpisodeQuery, null);

    expect(torrentCallCount).toBeGreaterThan(1);
    expect(hits).toHaveLength(torrentCallCount - 1);
  });

  it('fails the search with the first error when every torrent detail fails', async () => {
    const {client} = createClientWithAid();
    let torrentCallCount = 0;
    await answerFeed({
      answerTorrent: async () => {
        torrentCallCount += 1;
        throw torrentCallCount === 1
          ? makeRateLimitError()
          : makeUnavailableError();
      },
    });

    await expect(
      client.searchSubtitles?.(kitsuEpisodeQuery, null),
    ).rejects.toBeInstanceOf(SourceRateLimitError);
    expect(torrentCallCount).toBeGreaterThan(1);
  });

  it('fails the search as rate limited when any of the failed torrent details was', async () => {
    const {client} = createClientWithAid();
    let torrentCallCount = 0;
    await answerFeed({
      answerTorrent: async () => {
        torrentCallCount += 1;
        throw torrentCallCount === 2
          ? makeRateLimitError()
          : makeUnavailableError();
      },
    });

    await expect(
      client.searchSubtitles?.(kitsuEpisodeQuery, null),
    ).rejects.toBeInstanceOf(SourceRateLimitError);
    expect(torrentCallCount).toBeGreaterThan(2);
  });

  it('passes the abort signal to every request', async () => {
    const {client} = createClientWithAid();
    const {signal} = new AbortController();
    await answerFeed();

    await client.searchSubtitles?.(kitsuEpisodeQuery, null, {signal});

    expect(requestSubtitleSource.mock.calls.length).toBeGreaterThan(1);
    for (const [request] of requestSubtitleSource.mock.calls) {
      expect(request.signal).toBe(signal);
    }
  });

  it('downloads the attachment url and hands on the decoded subtitle', async () => {
    const [xzBytes, srtBytes] = await Promise.all([
      readFixture('subtitle-sources/animetosho/attachment-track3.eng.srt.xz'),
      readFixture('subtitle-sources/animetosho/attachment-track3.eng.srt'),
    ]);
    const {signal} = new AbortController();
    requestSubtitleSource.mockResolvedValue(toOk(xzBytes));

    const download = await animetoshoClient.downloadSubtitle?.(
      subtitleRef,
      null,
      {signal},
    );

    expect(requestSubtitleSource).toHaveBeenCalledTimes(1);
    expect(requestSubtitleSource).toHaveBeenCalledWith(
      expect.objectContaining({
        url: SAMPLE_ATTACHMENT_URL,
        responseType: 'bytes',
        signal,
      }),
    );
    expect(Buffer.from(download?.fileBytes ?? []).equals(srtBytes)).toBe(true);
    expect(download?.extractedEntryPath).toBeNull();
  });

  it('downloads nothing for an attachment url off the AnimeTosho storage', async () => {
    await expect(
      animetoshoClient.downloadSubtitle?.(
        {
          ...subtitleRef,
          siteFileUrl: 'https://storage.example.com/attachments/002bd/e25.xz',
        },
        null,
      ),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });
});
