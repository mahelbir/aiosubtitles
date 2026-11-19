import {Duplex} from 'node:stream';
import {StatusCodes} from 'http-status-codes';
import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  ANIMETOSHO_TORRENT_OPEN_MAX,
  animetoshoMapping,
} from '../../../src/lib/subtitle-sources/animetosho/animetosho-mapping.js';
import {subtitleSourceHitSchema} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {SourceUnavailableError} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {makeSearchQuery} from '../../helpers/subtitle-source-factories.js';

const FEED_FIXTURE = 'subtitle-sources/animetosho/sample-net-feed-json-q.json';
const TORRENT_FIXTURE =
  'subtitle-sources/animetosho/sample-net-show-torrent-604254.json';
const SRT_FIXTURE = 'subtitle-sources/animetosho/attachment-track3.eng.srt';
const XZ_FIXTURE = 'subtitle-sources/animetosho/attachment-track3.eng.srt.xz';
const ZERO_FILLED_XZ_FIXTURE =
  'subtitle-sources/animetosho/zero-filled-60mib.xz';
const FRIEREN_SECOND_SEASON_AID = '18886';
const SAMPLE_TORRENT_NAME =
  '[9volt] Sousou no Frieren - 38 (S02E10) (WEB 1080p HEVC EAC-3)';
const SAMPLE_ATTACHMENT_URL =
  'https://storage.animetosho.net/attachments/002bd/e25.xz?filename=%5B9volt%5D+Sousou+no+Frieren+-+38+%28S02E10%29+%28WEB+1080p+HEVC+EAC-3%29+%5B3DB7B2CE%5D_track3.eng.ass.xz';
const SAMPLE_FILE_NAME_HINT =
  '[9volt] Sousou no Frieren - 38 (S02E10) (WEB 1080p HEVC EAC-3) [3DB7B2CE]_track3.eng.ass';
const EPISODE_FIVE_TORRENT_IDS = [
  '612661',
  '612662',
  '612663',
  '603969',
  '602208',
];
const DECODE_TIMEOUT = 2000;
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
const sampleSubtitleRef = {
  subtitleSource: SubtitleSource.ANIMETOSHO,
  siteFileId: '3092648',
  siteFileUrl: SAMPLE_ATTACHMENT_URL,
  catalogSeason: null,
  catalogEpisode: null,
};

function toOk(body) {
  return {status: StatusCodes.OK, headers: {}, body};
}

function toNotFound() {
  return {status: StatusCodes.NOT_FOUND, headers: {}, body: null};
}

function catchError(callback) {
  try {
    callback();
  } catch (error) {
    return error;
  }
  return null;
}

function makeAttachment(overrides = {}, infoOverrides = {}) {
  return {
    id: 9100001,
    type: 'subtitle',
    size: null,
    url: 'https://storage.animetosho.net/attachments/0fixt/a01.xz?filename=Fixture_track3.eng.ass.xz',
    info: {
      default: true,
      forced: false,
      format: 'ASS',
      language_code: 'eng',
      name: 'English',
      tracknum: 3,
      ...infoOverrides,
    },
    ...overrides,
  };
}

function makeTorrentBody(files, overrides = {}) {
  return {
    id: 700001,
    torrent_name: '[Fixture] Sousou no Frieren S2 - 05 (1080p)',
    anidb_aid: 18886,
    is_batch: false,
    files,
    ...overrides,
  };
}

function makeFile(filename, attachments) {
  return {id: 800001, filename, is_archive: false, attachments};
}

function toHitsOf(attachments, languageCodes = ['eng', 'pob', 'por']) {
  return animetoshoMapping.toSearchHits(
    toOk(
      makeTorrentBody([
        makeFile(
          '[Fixture] Sousou no Frieren S2 - 05 (1080p).mkv',
          attachments,
        ),
      ]),
    ),
    {kitsuEpisode: 5, languageCodes},
  );
}

async function readSampleHits(languageCodes = ['eng']) {
  return animetoshoMapping.toSearchHits(
    toOk(await readFixture(TORRENT_FIXTURE)),
    {kitsuEpisode: 10, languageCodes},
  );
}

async function pickTorrentIdsOf(feedBody, kitsuEpisode) {
  return (
    animetoshoMapping.pickTorrentIds(toOk(feedBody), {
      anidbId: FRIEREN_SECOND_SEASON_AID,
      kitsuEpisode,
    }) ?? []
  ).map(String);
}

function createEndlessDecoder(createdDecoders) {
  const decoder = new Duplex({
    write(chunk, encoding, callback) {
      callback();
    },
    read() {
      this.push(Buffer.alloc(1024, 0x41));
    },
  });
  createdDecoders.push(decoder);
  return decoder;
}

describe('the AnimeTosho anime lookup', () => {
  it('reads the Kitsu id and the Kitsu episode from the video id, not the IMDb episode', () => {
    expect(animetoshoMapping.toAnimeLookup(kitsuEpisodeQuery)).toEqual({
      kitsuId: '7442',
      kitsuEpisode: 5,
    });
  });

  it('reads the Kitsu id and episode the query carries, not the video id', () => {
    expect(
      animetoshoMapping.toAnimeLookup({
        ...kitsuEpisodeQuery,
        videoId: 'kitsu:7442',
        kitsuEpisode: 7,
      }),
    ).toEqual({kitsuId: '7442', kitsuEpisode: 7});
  });

  it('asks nothing for an IMDb video', () => {
    expect(
      animetoshoMapping.toAnimeLookup(
        makeSearchQuery({
          videoId: 'tt2560140:2:5',
          videoType: 'series',
          imdbId: 'tt2560140',
          catalogSeason: 2,
          catalogEpisode: 5,
        }),
      ),
    ).toBeNull();
    expect(animetoshoMapping.toAnimeLookup(makeSearchQuery())).toBeNull();
  });

  it('reads a Kitsu id without an episode as an anime movie', () => {
    expect(
      animetoshoMapping.toAnimeLookup(
        makeSearchQuery({
          videoId: 'kitsu:7442',
          videoType: 'movie',
          imdbId: null,
          kitsuId: '7442',
        }),
      ),
    ).toEqual({kitsuId: '7442', kitsuEpisode: null});
  });
});

describe('the AnimeTosho requests', () => {
  it('asks the feed by AniDB anime id with our own user agent', () => {
    expect(
      animetoshoMapping.buildFeedRequest(FRIEREN_SECOND_SEASON_AID),
    ).toEqual({
      subtitleSource: SubtitleSource.ANIMETOSHO,
      url: 'https://feed.animetosho.net/json?aid=18886',
      method: 'GET',
      headers: {},
      responseType: 'json',
      acceptedStatuses: [],
      credentialId: null,
    });
  });

  it('asks one torrent detail by its id', () => {
    expect(animetoshoMapping.buildTorrentRequest(604254)).toEqual({
      subtitleSource: SubtitleSource.ANIMETOSHO,
      url: 'https://feed.animetosho.net/json?show=torrent&id=604254',
      method: 'GET',
      headers: {},
      responseType: 'json',
      acceptedStatuses: [],
      credentialId: null,
    });
  });

  it('asks the attachment url itself as bytes', () => {
    expect(animetoshoMapping.buildDownloadRequest(sampleSubtitleRef)).toEqual({
      subtitleSource: SubtitleSource.ANIMETOSHO,
      url: SAMPLE_ATTACHMENT_URL,
      method: 'GET',
      headers: {},
      responseType: 'bytes',
      acceptedStatuses: [],
      credentialId: null,
    });
  });

  it.each([
    ['no attachment url', null],
    ['an attachment url that is no url', 'not a url'],
    [
      'a plain http attachment url',
      'http://storage.animetosho.net/attachments/002bd/e25.xz',
    ],
    [
      'an attachment url off the AnimeTosho storage host',
      'https://storage.example.com/attachments/002bd/e25.xz',
    ],
    [
      'an attachment url on a look-alike host',
      'https://storage.animetosho.net.example.com/attachments/002bd/e25.xz',
    ],
    [
      'an attachment url with a user and password',
      'https://u:p@storage.animetosho.net/attachments/002bd/e25.xz',
    ],
    [
      'an attachment url with a port',
      'https://storage.animetosho.net:8443/attachments/002bd/e25.xz',
    ],
  ])('refuses %s as an unavailable source', (label, siteFileUrl) => {
    expect(
      catchError(() =>
        animetoshoMapping.buildDownloadRequest({
          ...sampleSubtitleRef,
          siteFileUrl,
        }),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('the AnimeTosho torrent picker', () => {
  it('opens only the torrents whose release name holds the episode', async () => {
    const torrentIds = await pickTorrentIdsOf(
      await readFixture(FEED_FIXTURE),
      5,
    );

    expect(torrentIds).toContain('602208');
    expect(
      torrentIds.every(torrentId =>
        EPISODE_FIVE_TORRENT_IDS.includes(torrentId),
      ),
    ).toBe(true);
    expect(new Set(torrentIds).size).toBe(torrentIds.length);
  });

  it('never opens a season pack whose name lists no episode', async () => {
    const torrentIds = await pickTorrentIdsOf(
      await readFixture(FEED_FIXTURE),
      5,
    );

    expect(torrentIds).toContain('602208');
    expect(torrentIds).not.toContain('686871');
    expect(torrentIds).not.toContain('604295');
  });

  it('never opens a torrent of another AniDB anime', async () => {
    const feedBody = await readFixture(FEED_FIXTURE);
    const otherAnimeItem = {
      ...feedBody.find(feedItem => feedItem.id === 602208),
      id: 990001,
      anidb_aid: 17617,
    };
    const unknownAnimeItem = {...otherAnimeItem, id: 990002, anidb_aid: null};

    const torrentIds = await pickTorrentIdsOf(
      [otherAnimeItem, unknownAnimeItem, ...feedBody],
      5,
    );

    expect(torrentIds).not.toContain('990001');
    expect(torrentIds).not.toContain('990002');
    expect(torrentIds).toContain('602208');
  });

  it('opens a torrent whatever its processing status', async () => {
    const feedBody = await readFixture(FEED_FIXTURE);
    const unknownStatusItem = feedBody.find(feedItem => feedItem.id === 604254);

    expect(unknownStatusItem.status).toBe('unknown');
    await expect(pickTorrentIdsOf([unknownStatusItem], 10)).resolves.toEqual([
      '604254',
    ]);
  });

  it('opens a few torrents at most for a busy episode', async () => {
    const torrentIds = await pickTorrentIdsOf(
      await readFixture(FEED_FIXTURE),
      10,
    );

    expect(Number.isInteger(ANIMETOSHO_TORRENT_OPEN_MAX)).toBe(true);
    expect(ANIMETOSHO_TORRENT_OPEN_MAX).toBeGreaterThan(0);
    expect(torrentIds.length).toBeGreaterThan(0);
    expect(torrentIds.length).toBeLessThanOrEqual(ANIMETOSHO_TORRENT_OPEN_MAX);
  });

  it('opens only the releases tied to no episode for an anime movie', async () => {
    const torrentIds = await pickTorrentIdsOf(
      [
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
        {
          id: 990013,
          anidb_aid: 18886,
          torrent_name: '[Fixture] Sousou no Frieren S02 (BD 1080p)',
        },
      ],
      null,
    );

    expect(torrentIds).toEqual(['990011']);
  });

  it('keeps every file of a torrent for an anime movie', () => {
    const hits = animetoshoMapping.toSearchHits(
      toOk(
        makeTorrentBody(
          [
            makeFile('[Fixture] Sousou no Frieren Movie (1080p).mkv', [
              makeAttachment({id: 9300001}),
            ]),
          ],
          {
            torrent_name: '[Fixture] Sousou no Frieren Movie (1080p)',
            is_batch: true,
          },
        ),
      ),
      {kitsuEpisode: null, languageCodes: ['eng']},
    );

    expect(hits).toMatchObject([{siteFileId: '9300001'}]);
  });

  it('answers an empty feed with no torrents', () => {
    expect(
      animetoshoMapping.pickTorrentIds(toOk([]), {
        anidbId: FRIEREN_SECOND_SEASON_AID,
        kitsuEpisode: 5,
      }),
    ).toEqual([]);
  });

  it.each([
    ['an object', {error: 'Unknown parameter'}],
    ['a page of html', '<html><body>Moved</body></html>'],
    ['nothing', null],
  ])(
    'treats a feed body that is %s as an unavailable source',
    (label, body) => {
      expect(
        catchError(() =>
          animetoshoMapping.pickTorrentIds(toOk(body), {
            anidbId: FRIEREN_SECOND_SEASON_AID,
            kitsuEpisode: 5,
          }),
        ),
      ).toBeInstanceOf(SourceUnavailableError);
    },
  );

  it('treats a missing feed as an unavailable source', () => {
    expect(
      catchError(() =>
        animetoshoMapping.pickTorrentIds(toNotFound(), {
          anidbId: FRIEREN_SECOND_SEASON_AID,
          kitsuEpisode: 5,
        }),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('the AnimeTosho torrent detail', () => {
  it('maps the subtitle attachment of the sample torrent to one hit', async () => {
    await expect(readSampleHits()).resolves.toEqual([
      {
        subtitleSource: SubtitleSource.ANIMETOSHO,
        siteFileId: '3092648',
        languageCode: 'eng',
        releaseNames: [SAMPLE_TORRENT_NAME],
        fileExtension: 'ass',
        isSitePack: false,
        isHearingImpaired: null,
        isForced: false,
        isMachineTranslated: null,
        isUploaderTrusted: null,
        isQuotaCostly: false,
        siteDownloadCount: null,
        siteFps: null,
        siteFileUrl: SAMPLE_ATTACHMENT_URL,
        siteCueCount: null,
        siteDurationMs: null,
        hashMatchVideoHashes: [],
        subtitleAliases: [],
      },
    ]);
  });

  it('gives hits that pass the hit schema', async () => {
    const hits = [
      ...((await readSampleHits()) ?? []),
      ...(toHitsOf([
        makeAttachment({id: 9100002}, {format: 'SRT', forced: true}),
        makeAttachment(
          {id: 9100003},
          {language_code: 'por', name: 'Portuguese[BR]'},
        ),
      ]) ?? []),
    ];

    expect(hits).toHaveLength(3);
    for (const hit of hits) {
      expect(subtitleSourceHitSchema.safeParse(hit).success).toBe(true);
    }
  });

  it('reads the format and the forced flag from the attachment info', () => {
    const hits = toHitsOf([
      makeAttachment({id: 9100002}, {format: 'SRT', forced: true}),
      makeAttachment({id: 9100003}, {format: 'ASS'}),
    ]);

    expect(hits).toMatchObject([
      {siteFileId: '9100002', fileExtension: 'srt', isForced: true},
      {siteFileId: '9100003', fileExtension: 'ass', isForced: false},
    ]);
  });

  it('reads Brazilian Portuguese from the attachment name', () => {
    const hits = toHitsOf([
      makeAttachment(
        {id: 9100002},
        {language_code: 'por', name: 'Portuguese[BR]'},
      ),
      makeAttachment({id: 9100003}, {language_code: 'por', name: 'Portuguese'}),
    ]);

    expect(hits).toMatchObject([
      {siteFileId: '9100002', languageCode: 'pob'},
      {siteFileId: '9100003', languageCode: 'por'},
    ]);
  });

  it('keeps only the asked languages', () => {
    const hits = toHitsOf(
      [
        makeAttachment({id: 9100002}),
        makeAttachment({id: 9100003}, {language_code: 'spa', name: 'Spanish'}),
      ],
      ['eng'],
    );

    expect(hits).toMatchObject([{siteFileId: '9100002'}]);
    expect(hits).toHaveLength(1);
  });

  it.each([
    ['an attachment that is not a subtitle', makeAttachment({type: 'font'})],
    ['a subtitle without its info', makeAttachment({info: undefined})],
    [
      'a subtitle in an undetermined language',
      makeAttachment({}, {language_code: 'und', name: 'Undetermined'}),
    ],
    [
      'a subtitle in a language that does not map',
      makeAttachment({}, {language_code: 'zzz', name: 'Fixture'}),
    ],
    ['an image subtitle', makeAttachment({}, {format: 'PGS'})],
    ['a subtitle without a download url', makeAttachment({url: null})],
  ])('drops %s', (label, attachment) => {
    expect(toHitsOf([attachment])).toEqual([]);
  });

  it('keeps only the attachments of the episode file in a batch', () => {
    const batchBody = makeTorrentBody(
      [
        makeFile('[Fixture] Sousou no Frieren S2 - 04 (1080p) [AAAA0004].mkv', [
          makeAttachment({id: 9200004}),
        ]),
        makeFile('[Fixture] Sousou no Frieren S2 - 05 (1080p) [AAAA0005].mkv', [
          makeAttachment({id: 9200005}),
          makeAttachment({id: 9200015, type: 'font'}),
        ]),
        makeFile('[Fixture] Sousou no Frieren S2 - 06 (1080p) [AAAA0006].mkv', [
          makeAttachment({id: 9200006}),
        ]),
      ],
      {
        torrent_name: '[Fixture] Sousou no Frieren S2 (01-10) (1080p) [Batch]',
        is_batch: true,
      },
    );

    const hits = animetoshoMapping.toSearchHits(toOk(batchBody), {
      kitsuEpisode: 5,
      languageCodes: ['eng'],
    });

    expect(hits).toMatchObject([{siteFileId: '9200005'}]);
    expect(hits).toHaveLength(1);
  });

  it('answers a torrent without subtitle attachments with no hits', () => {
    expect(
      animetoshoMapping.toSearchHits(
        toOk(makeTorrentBody([makeFile('Fixture.mkv', [])])),
        {kitsuEpisode: 5, languageCodes: ['eng']},
      ),
    ).toEqual([]);
  });

  it.each([
    ['without its file list', {id: 700001, torrent_name: 'Fixture'}],
    ['that is a list', []],
    ['that is nothing', null],
  ])('treats a torrent detail %s as an unavailable source', (label, body) => {
    expect(
      catchError(() =>
        animetoshoMapping.toSearchHits(toOk(body), {
          kitsuEpisode: 5,
          languageCodes: ['eng'],
        }),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('treats a missing torrent detail as an unavailable source', () => {
    expect(
      catchError(() =>
        animetoshoMapping.toSearchHits(toNotFound(), {
          kitsuEpisode: 5,
          languageCodes: ['eng'],
        }),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('the AnimeTosho download', () => {
  it('decodes the xz attachment to the subtitle it holds', async () => {
    const [xzBytes, srtBytes] = await Promise.all([
      readFixture(XZ_FIXTURE),
      readFixture(SRT_FIXTURE),
    ]);

    const download = await animetoshoMapping.toDownload(toOk(xzBytes), {
      siteFileUrl: SAMPLE_ATTACHMENT_URL,
    });

    expect(Buffer.from(download?.fileBytes ?? []).equals(srtBytes)).toBe(true);
    expect(download).toMatchObject({
      fileNameHint: SAMPLE_FILE_NAME_HINT,
      extractedEntryPath: null,
    });
  });

  it('gives no file name hint when the attachment url names no file', async () => {
    const download = await animetoshoMapping.toDownload(
      toOk(await readFixture(XZ_FIXTURE)),
      {siteFileUrl: 'https://storage.animetosho.net/attachments/002bd/e25.xz'},
    );

    expect(download?.fileNameHint).toBeNull();
  });

  it(
    'refuses a subtitle that decodes past the size bound',
    async () => {
      await expect(
        animetoshoMapping.toDownload(toOk(await readFixture(XZ_FIXTURE)), {
          siteFileUrl: SAMPLE_ATTACHMENT_URL,
          decodedBytesMax: 16,
        }),
      ).rejects.toBeInstanceOf(SourceUnavailableError);
    },
    DECODE_TIMEOUT,
  );

  it(
    'refuses an attachment that decodes past the default bound',
    async () => {
      await expect(
        animetoshoMapping.toDownload(
          toOk(await readFixture(ZERO_FILLED_XZ_FIXTURE)),
          {siteFileUrl: SAMPLE_ATTACHMENT_URL},
        ),
      ).rejects.toBeInstanceOf(SourceUnavailableError);
    },
    DECODE_TIMEOUT,
  );

  it(
    'stops feeding a decoder that never ends once past the bound',
    async () => {
      const createdDecoders = [];

      await expect(
        animetoshoMapping.toDownload(toOk(await readFixture(XZ_FIXTURE)), {
          siteFileUrl: SAMPLE_ATTACHMENT_URL,
          decodedBytesMax: 4096,
          createDecoder: () => createEndlessDecoder(createdDecoders),
        }),
      ).rejects.toBeInstanceOf(SourceUnavailableError);
      expect(createdDecoders).toHaveLength(1);
      expect(createdDecoders[0].destroyed).toBe(true);
    },
    DECODE_TIMEOUT,
  );

  it.each([
    [
      'a truncated attachment',
      async () => (await readFixture(XZ_FIXTURE)).subarray(0, 60),
    ],
    [
      'an attachment with bytes after the stream',
      async () =>
        Buffer.concat([await readFixture(XZ_FIXTURE), Buffer.from('junk')]),
    ],
    ['an attachment that is no xz', async () => readFixture(SRT_FIXTURE)],
    ['an empty attachment', async () => Buffer.alloc(0)],
  ])(
    'treats %s as an unavailable source',
    async (label, readBytes) => {
      await expect(
        animetoshoMapping.toDownload(toOk(await readBytes()), {
          siteFileUrl: SAMPLE_ATTACHMENT_URL,
        }),
      ).rejects.toBeInstanceOf(SourceUnavailableError);
    },
    DECODE_TIMEOUT,
  );

  it('treats a missing attachment as an unavailable source', async () => {
    await expect(
      animetoshoMapping.toDownload(toNotFound(), {
        siteFileUrl: SAMPLE_ATTACHMENT_URL,
      }),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
  });
});
