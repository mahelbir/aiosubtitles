import {describe, expect, it} from 'vitest';
import {
  ReleaseEdition,
  ReleaseSourceFamily,
} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {parseWithGuessit} from '../../src/parser-test/adapters/guessit.js';
import {parseWithReleaseParser} from '../../src/parser-test/adapters/release-parser.js';
import {
  chooseVideoFilenameReading,
  parseWithVideoFilenameParser,
} from '../../src/parser-test/adapters/video-filename-parser.js';
import {parseGuessitYaml} from '../../src/parser-test/datasets/guessit-yaml.js';
import {normalizeParsedField} from '../../src/parser-test/normalize-fields.js';

const OTHER_SOURCE_FAMILY = 'other';

describe('edition reduction', () => {
  it('reduces several canonical editions to the first in canonical order', () => {
    expect(
      normalizeParsedField('releaseEdition', ['Unrated', "Director's Cut"]),
    ).toBe(ReleaseEdition.DIRECTORS_CUT);
    expect(
      normalizeParsedField('releaseEdition', [
        'Remastered',
        'Extended Edition',
      ]),
    ).toBe(ReleaseEdition.EXTENDED);
  });

  it('keeps the one canonical edition among editions outside the set', () => {
    expect(
      normalizeParsedField('releaseEdition', [
        'Criterion Collection',
        'IMAX',
        'Limited',
      ]),
    ).toBe(ReleaseEdition.IMAX);
  });

  it.each([
    'Limited',
    'Criterion',
    'Collector',
    "Collector's Edition",
    'Anniversary Edition',
    'Alternative Cut',
    'Uncensored',
    'Festival',
    'Deluxe',
  ])('drops %s, which is outside the canonical set', rawEdition => {
    expect(normalizeParsedField('releaseEdition', rawEdition)).toBeNull();
  });

  it.each([
    ["Director's Definitive Cut", ReleaseEdition.DIRECTORS_CUT],
    ['directors', ReleaseEdition.DIRECTORS_CUT],
    ['Theatrical Cut', ReleaseEdition.THEATRICAL],
    ['4K Remastered', ReleaseEdition.REMASTERED],
    ['Remaster', ReleaseEdition.REMASTERED],
    ['Extended Cut', ReleaseEdition.EXTENDED],
  ])('maps the variant %s', (rawEdition, edition) => {
    expect(normalizeParsedField('releaseEdition', rawEdition)).toBe(edition);
  });
});

describe('borderline source tokens', () => {
  it.each([
    ['PDTV', ReleaseSourceFamily.HDTV],
    ['SDTV', ReleaseSourceFamily.HDTV],
    ['TVRip', ReleaseSourceFamily.HDTV],
    ['HDTVRip', ReleaseSourceFamily.HDTV],
    ['Digital TV', ReleaseSourceFamily.HDTV],
    ['Satellite', ReleaseSourceFamily.HDTV],
    ['SATRip', ReleaseSourceFamily.HDTV],
    ['Analog HDTV', ReleaseSourceFamily.HDTV],
    ['Ultra HDTV', ReleaseSourceFamily.HDTV],
    ['Pay-per-view', ReleaseSourceFamily.HDTV],
    ['PPVRip', ReleaseSourceFamily.HDTV],
    ['WEB-DLRip', ReleaseSourceFamily.WEB],
    ['WEBCap', ReleaseSourceFamily.WEB],
    ['WEBMux', ReleaseSourceFamily.WEB],
    ['Video on Demand', ReleaseSourceFamily.WEB],
    ['VODR', ReleaseSourceFamily.WEB],
    ['UHD BluRay', ReleaseSourceFamily.BLURAY],
    ['UHDRip', ReleaseSourceFamily.BLURAY],
    ['BR-DISK', ReleaseSourceFamily.BLURAY],
    ['DVDR', ReleaseSourceFamily.DVD],
    ['HD-DVD', OTHER_SOURCE_FAMILY],
    ['HDRip', OTHER_SOURCE_FAMILY],
    ['SCR', OTHER_SOURCE_FAMILY],
    ['Screener', OTHER_SOURCE_FAMILY],
    ['DVDScr', ReleaseSourceFamily.DVD],
    ['R5', ReleaseSourceFamily.DVD],
    ['Region 5', ReleaseSourceFamily.DVD],
    ['Remux', ReleaseSourceFamily.BLURAY],
    ['WORKPRINT', OTHER_SOURCE_FAMILY],
    ['TeleCine', OTHER_SOURCE_FAMILY],
    ['VHS', OTHER_SOURCE_FAMILY],
    ['Laserdisc', OTHER_SOURCE_FAMILY],
    ['Digital Master', OTHER_SOURCE_FAMILY],
    ['HD Camera', OTHER_SOURCE_FAMILY],
  ])('maps %s to %s', (rawSource, sourceFamily) => {
    expect(normalizeParsedField('releaseSourceFamily', rawSource)).toBe(
      sourceFamily,
    );
  });

  it('maps an unknown source token to other', () => {
    expect(normalizeParsedField('releaseSourceFamily', 'Mystery Disc')).toBe(
      OTHER_SOURCE_FAMILY,
    );
  });

  it('reduces several sources to the first family in family order', () => {
    expect(
      normalizeParsedField('releaseSourceFamily', ['WEBRIP', 'BLURAY']),
    ).toBe(ReleaseSourceFamily.BLURAY);
    expect(normalizeParsedField('releaseSourceFamily', ['CAM', 'TV'])).toBe(
      ReleaseSourceFamily.HDTV,
    );
  });
});

describe('streaming service table', () => {
  it.each([
    ['Amazon', 'AMZN'],
    ['AMZN-CBR', 'AMZN'],
    ['Paramount+', 'PMTP'],
    ['Peacock', 'PCOK'],
    ['iTunes', 'iT'],
    ['iT', 'iT'],
    ['BBC iPlayer', 'iP'],
    ['Crunchy Roll', 'CR'],
    ['Crunchyroll', 'CR'],
    ['HBO Go', 'HBO'],
    ['HBO', 'HBO'],
    ['Max', 'MAX'],
    ['Disney', 'DSNY'],
    ['Disney+ Hotstar', 'HOTSTAR'],
    ['Apple TV', 'ATVP'],
    ['APTV', 'ATVP'],
    ['Animal Planet', 'ANPL'],
    ['ANPL', 'ANPL'],
    ['The Roku Channel', 'ROKU'],
    ['Roku Channel', 'ROKU'],
    ['Google TV', 'GPLAY'],
    ['MGM+', 'MGMP'],
    ['Movies Anywhere', 'MA'],
    ['Sony Pictures Core', 'BCORE'],
    ['SkyShowtime', 'SKST'],
    ['Showtime', 'SHO'],
    ['Starz', 'STZ'],
    ['ITVX', 'ITV'],
    ['Channel 4', 'ALL4'],
    ['Discovery+', 'DSCP'],
    ['Discovery Plus', 'DSCP'],
    ['Curiosity Stream', 'CUR'],
    ['Comedy Central', 'CC'],
    ["America's Test Kitchen", 'ATK'],
    ['ABC', 'ABC'],
    ['AMBC', 'ABC'],
    ['YouTube Red', 'RED'],
    ['YouTube Premium', 'RED'],
  ])('maps %s to %s', (rawService, serviceCode) => {
    expect(normalizeParsedField('streamingService', rawService)).toBe(
      serviceCode,
    );
  });

  it('keeps an unmapped service as its upper-case key without separators', () => {
    expect(normalizeParsedField('streamingService', 'Fancy Stream.TV')).toBe(
      'FANCYSTREAMTV',
    );
    expect(normalizeParsedField('streamingService', 'fancy-streamtv')).toBe(
      'FANCYSTREAMTV',
    );
  });
});

describe('release-parser edition flags', () => {
  it('reads the extended flag as an edition', () => {
    expect(
      parseWithReleaseParser('Movie.Name.2019.EXTENDED.1080p.BluRay.x264-GRP')
        .releaseEdition,
    ).toBe(ReleaseEdition.EXTENDED);
  });

  it('reads the unrated flag as an edition', () => {
    expect(
      parseWithReleaseParser('Movie.Name.2019.UNRATED.1080p.BluRay.x264-GRP')
        .releaseEdition,
    ).toBe(ReleaseEdition.UNRATED);
  });
});

describe('video-filename-parser mode choice', () => {
  it('reads a show with a year before the episode marker in TV mode', () => {
    expect(
      parseWithVideoFilenameParser('Show.2019.S01E02.1080p.WEB-DL-GRP'),
    ).toMatchObject({seasonNumbers: [1], episodeNumbers: [2]});
  });

  it.each([
    'Some.Girls.1998.DVDRip-GRP',
    'Movie.2005.720p.HDTV-GRP',
    'Movie.Name.2019.EXTENDED.1080p.BluRay.x264-SPARKS',
  ])(
    'reads %s in movie mode when TV mode reads its year as an episode',
    releaseName => {
      expect(chooseVideoFilenameReading(releaseName).isTv).toBeUndefined();
    },
  );

  it('reads a name without any episode marker in movie mode', () => {
    expect(
      parseWithVideoFilenameParser('Movie.Name.1080p.BluRay-GRP'),
    ).toMatchObject({
      seasonNumbers: [],
      episodeNumbers: [],
      releaseTitle: 'movie name',
    });
  });

  it('reads a season pack in TV mode with no episode', () => {
    expect(
      parseWithVideoFilenameParser('Show.Name.S01.1080p.WEB-DL-GRP'),
    ).toMatchObject({
      seasonNumbers: [1],
      episodeNumbers: [],
      releaseTitle: 'show name',
    });
  });

  it('reads its edition flags as editions', () => {
    expect(
      parseWithVideoFilenameParser(
        'Movie.Name.2019.Theatrical.1080p.BluRay.x264-GRP',
      ).releaseEdition,
    ).toBe(ReleaseEdition.THEATRICAL);
  });
});

const guessitSourceOf = guessitReading =>
  parseWithGuessit('Any.Name', {
    guessitVersion: '4.5.1',
    parsedByName: {'Any.Name': guessitReading},
  }).releaseSourceFamily;

describe('guessit other values', () => {
  it.each([
    [{other: 'Remux'}, ReleaseSourceFamily.BLURAY],
    [{other: ['Proper', 'Remux']}, ReleaseSourceFamily.BLURAY],
    [{other: 'Screener'}, OTHER_SOURCE_FAMILY],
    [{other: 'Region 5'}, ReleaseSourceFamily.DVD],
    [{other: ['HD', 'Rip']}, OTHER_SOURCE_FAMILY],
    [{other: ['Rip', 'Proper', 'HD']}, OTHER_SOURCE_FAMILY],
    [{other: 'Rip'}, null],
    [{source: 'Web', other: ['HD', 'Rip']}, ReleaseSourceFamily.WEB],
    [{source: 'DVD', other: 'Screener'}, ReleaseSourceFamily.DVD],
    [{source: 'Web', other: 'Remux'}, ReleaseSourceFamily.WEB],
  ])('reads %j as the family %s', (guessitReading, sourceFamily) => {
    expect(guessitSourceOf(guessitReading)).toBe(sourceFamily);
  });

  it('asserts a family from other in a guessit yml entry', () => {
    expect(
      parseGuessitYaml(
        '? Bare.Remux.2001-GRP\n: title: Bare\n  other: Remux\n',
      ),
    ).toEqual([
      {
        releaseName: 'Bare.Remux.2001-GRP',
        expectedFields: {
          releaseTitle: 'bare',
          releaseSourceFamily: ReleaseSourceFamily.BLURAY,
        },
      },
    ]);
  });
});

describe('title folding', () => {
  it('folds a Turkish dotted capital I without splitting the word', () => {
    expect(normalizeParsedField('releaseTitle', 'İstanbul Hatırası')).toBe(
      'istanbul hatırası',
    );
  });

  it('gives the same title for composed and decomposed input', () => {
    expect(normalizeParsedField('releaseTitle', 'Pokémon')).toBe('pokémon');
    expect(normalizeParsedField('releaseTitle', 'Pokémon')).toBe('pokémon');
  });

  it('keeps combining marks and every script inside a word', () => {
    expect(normalizeParsedField('releaseTitle', 'Tōkyō.東京-Story: अनुक्ष')).toBe(
      'tōkyō 東京 story अनुक्ष',
    );
  });
});
