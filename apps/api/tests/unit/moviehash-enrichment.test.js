import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {PrivateOutputPathError} from '@repo/tooling/private-output.js';
import {
  createGuardedSearch,
  createSearchCase,
  parseEnrichmentArgs,
  readIdentities,
  runMoviehashEnrichment,
} from '../../scripts/moviehash-enrichment.js';
import {
  makeSearchQuery,
  makeSubtitleSourceHit,
} from '../helpers/subtitle-source-factories.js';

const UPPER_CASE_HASH = 'AABBCCDDEEFF0011';
const IDENTITY_FILE_NAME = 'Private.Show.S01E01.1080p.mkv';

const EPISODE_HASH = '00aa11bb22cc33dd';
const MOVIE_HASH = '44ee55ff66aa77bb';
const SEARCHED_LANGUAGE_CODES = ['tur', 'eng'];

const identities = {
  videos: {
    V92: {
      title: 'Fixture Film',
      fileName: 'Fixture.Film.2019.1080p.mp4',
      catalogId: 'tt0000092',
      osHash: MOVIE_HASH,
    },
    V90: {
      title: 'Fixture Show',
      fileName: 'Fixture.Show.S01E02.1080p.WEB-FAKE.mkv',
      catalogId: 'tt0000090:1:2',
      osHash: EPISODE_HASH,
    },
    V93: {
      title: 'Fixture Unhashed',
      fileName: 'Fixture.Unhashed.2020.mkv',
      catalogId: 'tt0000093',
    },
  },
};

function makeHit(siteFileId, hashMatchVideoHashes = []) {
  return makeSubtitleSourceHit({
    subtitleSource: SubtitleSource.OPENSUBTITLES,
    siteFileId,
    hashMatchVideoHashes,
  });
}

function makeFakeSearchCase() {
  const hitsByHash = new Map([
    [EPISODE_HASH, [makeHit('7001', [EPISODE_HASH]), makeHit('7002')]],
    [MOVIE_HASH, [makeHit('8001')]],
  ]);
  return vi.fn(async searchQuery => hitsByHash.get(searchQuery.videoHash));
}

describe('runMoviehashEnrichment', () => {
  it('counts hits and hash matches per hashed case', async () => {
    const searchCase = makeFakeSearchCase();
    const enrichmentCases = await runMoviehashEnrichment({
      identities,
      searchCase,
    });
    expect(enrichmentCases).toEqual([
      {
        caseCode: 'V90',
        searchedLanguageCodes: SEARCHED_LANGUAGE_CODES,
        hitCount: 2,
        hashMatchCount: 1,
        hashMatchSiteFileIds: ['7001'],
      },
      {
        caseCode: 'V92',
        searchedLanguageCodes: SEARCHED_LANGUAGE_CODES,
        hitCount: 1,
        hashMatchCount: 0,
        hashMatchSiteFileIds: [],
      },
    ]);
  });

  it('searches an episode case by its hash, IMDb id, season and episode', async () => {
    const searchCase = makeFakeSearchCase();
    await runMoviehashEnrichment({identities, searchCase});
    expect(searchCase).toHaveBeenCalledWith(
      expect.objectContaining({
        videoType: 'series',
        imdbId: 'tt0000090',
        catalogSeason: 1,
        catalogEpisode: 2,
        languageCodes: SEARCHED_LANGUAGE_CODES,
        videoHash: EPISODE_HASH,
      }),
    );
  });

  it('searches a movie case by its hash and IMDb id', async () => {
    const searchCase = makeFakeSearchCase();
    await runMoviehashEnrichment({identities, searchCase});
    expect(searchCase).toHaveBeenCalledWith(
      expect.objectContaining({
        videoType: 'movie',
        imdbId: 'tt0000092',
        catalogSeason: null,
        catalogEpisode: null,
        languageCodes: SEARCHED_LANGUAGE_CODES,
        videoHash: MOVIE_HASH,
      }),
    );
  });

  it('never searches a video without a hash', async () => {
    const searchCase = makeFakeSearchCase();
    await runMoviehashEnrichment({identities, searchCase});
    expect(searchCase).toHaveBeenCalledTimes(2);
    expect(searchCase).not.toHaveBeenCalledWith(
      expect.objectContaining({imdbId: 'tt0000093'}),
    );
  });

  it('matches an upper-case identity hash against the lower-case hit hash', async () => {
    const enrichmentCases = await runMoviehashEnrichment({
      identities: {
        videos: {
          V94: {catalogId: 'tt0000094', osHash: UPPER_CASE_HASH},
        },
      },
      searchCase: async () => [
        makeHit('9001', [UPPER_CASE_HASH.toLowerCase()]),
      ],
    });
    expect(enrichmentCases[0]).toMatchObject({
      hashMatchCount: 1,
      hashMatchSiteFileIds: ['9001'],
    });
  });
});

describe('createGuardedSearch', () => {
  it('sends no queued search after one fails', async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(new Error('Search failed.'))
      .mockResolvedValue([]);
    const guardedSearch = createGuardedSearch(search);
    const searchOutcomes = await Promise.allSettled(
      ['first', 'second', 'third'].map(videoId => guardedSearch({videoId})),
    );
    expect(search).toHaveBeenCalledTimes(1);
    expect(searchOutcomes.map(({status}) => status)).toEqual([
      'rejected',
      'rejected',
      'rejected',
    ]);
  });

  it('passes every search through while none fails', async () => {
    const search = vi.fn(async searchQuery => [searchQuery.videoId]);
    const guardedSearch = createGuardedSearch(search);
    await expect(
      Promise.all(['first', 'second'].map(videoId => guardedSearch({videoId}))),
    ).resolves.toEqual([['first'], ['second']]);
  });
});

describe('createSearchCase', () => {
  it('builds a search over the secrets-file key that asks nothing for a query it cannot search', async () => {
    const searchCase = await createSearchCase({
      loadSecrets: () => ({OPENSUBTITLES_API_KEY: 'fake-opensubtitles-key'}),
    });

    await expect(
      searchCase(makeSearchQuery({imdbId: null, languageCodes: ['tur']})),
    ).resolves.toBeNull();
  });

  it('refuses to start without the OpenSubtitles key', async () => {
    await expect(createSearchCase({loadSecrets: () => ({})})).rejects.toThrow(
      'OPENSUBTITLES_API_KEY is missing from the secrets file.',
    );
  });
});

describe('readIdentities', () => {
  let workRoot;

  beforeEach(async () => {
    workRoot = await mkdtemp(path.join(tmpdir(), 'moviehash-identities-'));
  });

  afterEach(async () => {
    await rm(workRoot, {recursive: true, force: true});
  });

  it('reads the identities file', async () => {
    const identitiesPath = path.join(workRoot, 'identities.json');
    await writeFile(identitiesPath, JSON.stringify(identities), 'utf8');
    await expect(readIdentities(identitiesPath)).resolves.toEqual(identities);
  });

  it('throws a fixed message that quotes nothing from a broken file', async () => {
    const identitiesPath = path.join(workRoot, 'identities.json');
    await writeFile(
      identitiesPath,
      `{"videos": {"V90": "${IDENTITY_FILE_NAME}"`,
      'utf8',
    );
    const readError = await readIdentities(identitiesPath).catch(
      error => error,
    );
    expect(readError.message).toBe('The identities file is not valid JSON.');
    expect(`${readError.message} ${readError.stack}`).not.toContain(
      IDENTITY_FILE_NAME,
    );
    expect(readError.cause).toBeUndefined();
  });
});

describe('parseEnrichmentArgs', () => {
  let privateRoot;

  beforeEach(async () => {
    privateRoot = await mkdtemp(path.join(tmpdir(), 'moviehash-private-'));
  });

  afterEach(async () => {
    await rm(privateRoot, {recursive: true, force: true});
  });

  const makeArgs = ({identities: identitiesPath, output}) => [
    '--identities',
    identitiesPath,
    '--output',
    output,
  ];

  it('reads absolute paths with the output inside the private folder', () => {
    const scriptArgs = {
      identities: '/data/identities.json',
      output: path.join(privateRoot, 'moviehash-enrichment.json'),
    };
    expect(parseEnrichmentArgs(makeArgs(scriptArgs), {privateRoot})).toEqual(
      scriptArgs,
    );
  });

  it('rejects a relative identities path', () => {
    expect(() =>
      parseEnrichmentArgs(
        makeArgs({
          identities: 'identities.json',
          output: path.join(privateRoot, 'moviehash-enrichment.json'),
        }),
        {privateRoot},
      ),
    ).toThrow('--identities must be an absolute path.');
  });

  it('rejects an output outside the private folder', () => {
    expect(() =>
      parseEnrichmentArgs(
        makeArgs({
          identities: '/data/identities.json',
          output: path.join(tmpdir(), 'moviehash-enrichment.json'),
        }),
        {privateRoot},
      ),
    ).toThrow('--output must lie inside the private eval folder.');
  });

  it('rejects an output outside the default private folder', () => {
    expect(() =>
      parseEnrichmentArgs(
        makeArgs({
          identities: '/data/identities.json',
          output: path.join(privateRoot, 'moviehash-enrichment.json'),
        }),
      ),
    ).toThrow('--output must lie inside the private eval folder.');
  });

  it('rejects a private folder that git tracks', () => {
    const trackedRoot = path.join(import.meta.dirname, '..', 'fixtures');
    expect(() =>
      parseEnrichmentArgs(
        makeArgs({
          identities: '/data/identities.json',
          output: path.join(trackedRoot, 'moviehash-enrichment.json'),
        }),
        {privateRoot: trackedRoot},
      ),
    ).toThrow(PrivateOutputPathError);
  });
});
