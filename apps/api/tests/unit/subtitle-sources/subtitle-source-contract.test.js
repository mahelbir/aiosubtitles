import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {computeUrlCode} from '@repo/subtitle-core/stremio-row/url-code.js';
import {
  createSubtitleSourceRegistry,
  listSubtitleSourceClients,
} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {
  SubtitleSourceBudgetScope,
  buildImdbVideoId,
  isSupportedSubtitleSourceFormat,
  subtitleSourceHitSchema,
  toHitReleaseNames,
  toHitSiteFileId,
  toNullableBoolean,
  toSubtitleRowValues,
} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceRateLimitError,
  SourceUnavailableError,
} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {createFixtureSubtitleSourceClient} from '../../helpers/fixture-subtitle-source.js';
import {makeSubtitleSourceHit} from '../../helpers/subtitle-source-factories.js';

describe('SubtitleSourceBudgetScope', () => {
  it('scopes a download budget to the subtitle source or to the credential', () => {
    expect(SubtitleSourceBudgetScope.SUBTITLE_SOURCE).toBe('subtitle-source');
    expect(SubtitleSourceBudgetScope.CREDENTIAL).toBe('credential');
    expect([...SubtitleSourceBudgetScope.values].sort()).toEqual([
      'credential',
      'subtitle-source',
    ]);
  });
});

describe('subtitleSourceHitSchema', () => {
  it('accepts a complete hit', () => {
    expect(
      subtitleSourceHitSchema.safeParse(makeSubtitleSourceHit()).success,
    ).toBe(true);
  });

  it.each([
    ['an unknown language code', {languageCode: 'xx'}],
    ['an empty site file id', {siteFileId: ''}],
    ['a site file id over 512 characters', {siteFileId: 'a'.repeat(513)}],
    ['an unknown subtitle source', {subtitleSource: 'unknown'}],
    [
      'more than 20 release names',
      {releaseNames: Array.from({length: 21}, (_, index) => `Name.${index}`)},
    ],
    ['a release name over 512 characters', {releaseNames: ['a'.repeat(513)]}],
  ])('rejects %s', (_, overrides) => {
    expect(
      subtitleSourceHitSchema.safeParse(makeSubtitleSourceHit(overrides))
        .success,
    ).toBe(false);
  });

  it('accepts a site that reports zero frames per second', () => {
    expect(
      subtitleSourceHitSchema.safeParse(makeSubtitleSourceHit({siteFps: 0}))
        .success,
    ).toBe(true);
  });

  it('reads zero frames per second as unknown', () => {
    expect(
      subtitleSourceHitSchema.parse(makeSubtitleSourceHit({siteFps: 0}))
        .siteFps,
    ).toBeNull();
    expect(
      subtitleSourceHitSchema.parse(makeSubtitleSourceHit({siteFps: 23.976}))
        .siteFps,
    ).toBe(23.976);
  });

  it('accepts an http site file url and the integer column maximum', () => {
    expect(
      subtitleSourceHitSchema.safeParse(
        makeSubtitleSourceHit({
          siteFileUrl: 'https://dl.subdl.test/7781.zip',
          siteDownloadCount: 2147483647,
          hashMatchVideoHashes: ['8E245D9679D31E12'],
        }),
      ).success,
    ).toBe(true);
  });

  it.each([
    ['a fractional download count', {siteDownloadCount: 1.5}],
    ['a negative cue count', {siteCueCount: -1}],
    [
      'a download count over the integer column',
      {siteDownloadCount: 2147483648},
    ],
    ['a duration over the integer column', {siteDurationMs: 3e9}],
    ['a site file url that is not http', {siteFileUrl: 'ftp://dl.test/a.zip'}],
    ['a site file url that is not a url', {siteFileUrl: 'not a url'}],
    [
      'a site file url over 2048 characters',
      {siteFileUrl: `https://dl.test/${'a'.repeat(2048)}`},
    ],
    ['a video hash that is not 16 hex digits', {hashMatchVideoHashes: ['xyz']}],
    [
      'more than 20 video hashes',
      {
        hashMatchVideoHashes: Array.from(
          {length: 21},
          () => '8e245d9679d31e12',
        ),
      },
    ],
  ])('rejects %s, which the subtitles row cannot hold', (_, overrides) => {
    expect(
      subtitleSourceHitSchema.safeParse(makeSubtitleSourceHit(overrides))
        .success,
    ).toBe(false);
  });

  it('accepts the length limits themselves', () => {
    expect(
      subtitleSourceHitSchema.safeParse(
        makeSubtitleSourceHit({
          siteFileId: 'a'.repeat(512),
          releaseNames: Array.from({length: 20}, () => 'a'.repeat(512)),
        }),
      ).success,
    ).toBe(true);
  });
});

describe('isSupportedSubtitleSourceFormat', () => {
  it.each(['srt', 'ass', 'ssa', 'vtt', 'sub', 'zip', 'rar', '7z'])(
    'accepts the %s format',
    format => {
      expect(isSupportedSubtitleSourceFormat(format)).toBe(true);
    },
  );

  it.each(['SRT', '.srt', ' .Ass ', '.7Z'])(
    'reads %s regardless of case and a leading dot',
    format => {
      expect(isSupportedSubtitleSourceFormat(format)).toBe(true);
    },
  );

  it.each(['idx', 'sup', 'smi', 'sami', 'txt', 'mpl', 'usf', 'other'])(
    'refuses the %s format',
    format => {
      expect(isSupportedSubtitleSourceFormat(format)).toBe(false);
    },
  );

  it.each([null, undefined, '', '  ', '.'])(
    'keeps a hit whose format is not stated (%s)',
    format => {
      expect(isSupportedSubtitleSourceFormat(format)).toBe(true);
    },
  );
});

describe('toHitSiteFileId', () => {
  it.each([
    [' sub-7 ', 'sub-7'],
    ['8'.repeat(512), '8'.repeat(512)],
    [42, '42'],
  ])('reads %s as the site file id %s', (siteFileId, hitSiteFileId) => {
    expect(toHitSiteFileId(siteFileId)).toBe(hitSiteFileId);
  });

  it.each(['', '  ', '7'.repeat(513), 0, -3, 1.5, null, undefined])(
    'reads %s as no site file id',
    siteFileId => {
      expect(toHitSiteFileId(siteFileId)).toBeNull();
    },
  );
});

describe('buildImdbVideoId', () => {
  const episode = {
    videoType: 'series',
    imdbId: 'tt0877057',
    catalogSeason: 1,
    catalogEpisode: 2,
  };

  it('names a movie by its imdb id alone', () => {
    expect(
      buildImdbVideoId({...episode, videoType: 'movie', imdbId: 'tt2576852'}),
    ).toBe('tt2576852');
  });

  it('names an episode by its imdb id, season and episode', () => {
    expect(buildImdbVideoId(episode)).toBe('tt0877057:1:2');
  });

  it('names nothing without an imdb id', () => {
    expect(buildImdbVideoId({...episode, imdbId: null})).toBeNull();
  });

  it('names no series episode without its season or episode', () => {
    expect(buildImdbVideoId({...episode, catalogSeason: null})).toBeNull();
    expect(buildImdbVideoId({...episode, catalogEpisode: null})).toBeNull();
  });
});

describe('toNullableBoolean', () => {
  it('keeps a boolean and reads any other kind as unknown', () => {
    expect(
      [true, false, 'yes', 1, 0, null, undefined].map(toNullableBoolean),
    ).toEqual([true, false, null, null, null, null, null]);
  });
});

describe('toHitReleaseNames', () => {
  it('trims the names and drops empty and repeated ones', () => {
    expect(toHitReleaseNames([' A.1080p ', '', '  ', 'A.1080p', 'B'])).toEqual([
      'A.1080p',
      'B',
    ]);
  });

  it('drops a name over the length limit and keeps the first 20', () => {
    const releaseNames = toHitReleaseNames([
      'a'.repeat(513),
      ...Array.from({length: 25}, (_, nameIndex) => `Name.${nameIndex}`),
    ]);
    expect(releaseNames).toHaveLength(20);
    expect(releaseNames[0]).toBe('Name.0');
    expect(
      subtitleSourceHitSchema.safeParse(makeSubtitleSourceHit({releaseNames}))
        .success,
    ).toBe(true);
  });
});

describe('toSubtitleRowValues', () => {
  it('builds the subtitles row values with the shared url code', () => {
    const values = toSubtitleRowValues(
      makeSubtitleSourceHit({
        subtitleSource: 'thesubtitledb',
        siteFileId: '42',
      }),
    );
    expect(values.urlCode).toBe(
      computeUrlCode({
        subtitleSource: 'thesubtitledb',
        siteFileId: '42',
        archiveEntryPath: '',
      }),
    );
    expect(values.archiveEntryPath).toBe('');
  });

  it('carries isSitePack through', () => {
    expect(
      toSubtitleRowValues(makeSubtitleSourceHit({isSitePack: true})).isSitePack,
    ).toBe(true);
  });

  it('maps every hit field onto its subtitles attribute and nothing else', () => {
    const hit = makeSubtitleSourceHit({
      subtitleSource: 'subdl',
      siteFileId: '7781',
      languageCode: 'eng',
      releaseNames: ['Show.S01E02.1080p.WEB-DL-GROUP'],
      fileExtension: 'ass',
      isSitePack: true,
      isHearingImpaired: true,
      isForced: false,
      isMachineTranslated: false,
      isUploaderTrusted: true,
      isQuotaCostly: false,
      siteDownloadCount: 1200,
      siteFps: 23.976,
      siteFileUrl: 'https://dl.subdl.test/7781.zip',
      siteCueCount: 640,
      siteDurationMs: 2580000,
      hashMatchVideoHashes: ['8e245d9679d31e12'],
      subtitleAliases: [{aliasSource: 'wyzie', aliasSiteFileId: 'w-1'}],
    });
    expect(toSubtitleRowValues(hit)).toEqual({
      urlCode: computeUrlCode({
        subtitleSource: 'subdl',
        siteFileId: '7781',
        archiveEntryPath: '',
      }),
      subtitleSource: 'subdl',
      siteFileId: '7781',
      archiveEntryPath: '',
      fileExtension: 'ass',
      siteLanguageCode: 'eng',
      releaseNames: ['Show.S01E02.1080p.WEB-DL-GROUP'],
      isHearingImpaired: true,
      isForced: false,
      isMachineTranslated: false,
      isUploaderTrusted: true,
      isQuotaCostly: false,
      isSitePack: true,
      siteDownloadCount: 1200,
      siteFps: 23.976,
      siteFileUrl: 'https://dl.subdl.test/7781.zip',
      siteCueCount: 640,
      siteDurationMs: 2580000,
    });
  });
});

describe('subtitle source errors', () => {
  it('names the rate-limited source and carries the wait', () => {
    const error = new SourceRateLimitError({
      subtitleSource: 'thesubtitledb',
      retryAfterMs: 120000,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: 'SourceRateLimitError',
      message: 'TheSubtitleDB rate limit reached.',
      subtitleSource: 'thesubtitledb',
      retryAfterMs: 120000,
      credentialId: null,
    });
  });

  it('marks a rate limit as the credential own when a credential is named', () => {
    expect(
      new SourceRateLimitError({
        subtitleSource: 'subdl',
        retryAfterMs: 60000,
        credentialId: 'c1',
      }).credentialId,
    ).toBe('c1');
  });

  it('names the source that rejected a credential', () => {
    const error = new SourceCredentialError({
      subtitleSource: 'altyazidb',
      credentialId: 'c1',
    });
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: 'SourceCredentialError',
      message: 'AltyazıDB rejected the credential.',
      subtitleSource: 'altyazidb',
      credentialId: 'c1',
    });
  });

  it('names the unavailable source and keeps the cause', () => {
    const cause = new Error('socket hang up');
    const error = new SourceUnavailableError({
      subtitleSource: 'stremio-community-subtitles',
      cause,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: 'SourceUnavailableError',
      message: 'Community Subtitles is unavailable.',
      subtitleSource: 'stremio-community-subtitles',
    });
    expect(error.cause).toBe(cause);
  });
});

describe('createSubtitleSourceRegistry', () => {
  const theSubtitleDbClient = createFixtureSubtitleSourceClient({
    subtitleSource: 'thesubtitledb',
  });
  const altyaziDbClient = createFixtureSubtitleSourceClient({
    subtitleSource: 'altyazidb',
  });

  it('lists its clients in label order', () => {
    const registry = createSubtitleSourceRegistry([
      theSubtitleDbClient,
      altyaziDbClient,
    ]);
    expect(registry.listSubtitleSourceClients()).toEqual([
      altyaziDbClient,
      theSubtitleDbClient,
    ]);
  });

  it('finds a client by its subtitle source', () => {
    const registry = createSubtitleSourceRegistry([
      theSubtitleDbClient,
      altyaziDbClient,
    ]);
    expect(registry.getSubtitleSourceClient('altyazidb')).toBe(altyaziDbClient);
  });

  it('refuses two clients for one subtitle source', () => {
    expect(() =>
      createSubtitleSourceRegistry([
        theSubtitleDbClient,
        createFixtureSubtitleSourceClient({subtitleSource: 'thesubtitledb'}),
      ]),
    ).toThrow();
  });

  it('answers null for a subtitle source it does not hold', () => {
    const registry = createSubtitleSourceRegistry([theSubtitleDbClient]);
    expect(registry.getSubtitleSourceClient('unknown')).toBeNull();
    expect(registry.getSubtitleSourceClient('altyazidb')).toBeNull();
  });
});

describe('shipped subtitle source clients', () => {
  it('each honour the client contract', () => {
    for (const client of listSubtitleSourceClients()) {
      const {subtitleSource} = client;
      expect(SubtitleSource.has(subtitleSource), subtitleSource).toBe(true);
      expect(client.credentialKinds, subtitleSource).toEqual(
        SubtitleSource.item(subtitleSource).raw.credentialKinds,
      );
      expect(typeof client.isSearchHashSensitive, subtitleSource).toBe(
        'boolean',
      );
      expect(Array.isArray(client.downloadBudgets), subtitleSource).toBe(true);
      for (const methodName of [
        'canSearchWithoutCredential',
        'canDownloadWithoutCredential',
        'searchSubtitles',
        'downloadSubtitle',
      ]) {
        expect(
          typeof client[methodName],
          `${subtitleSource} ${methodName}`,
        ).toBe('function');
      }
      expect(typeof client.checkCredential === 'function', subtitleSource).toBe(
        client.credentialKinds.length > 0,
      );
    }
  });
});
