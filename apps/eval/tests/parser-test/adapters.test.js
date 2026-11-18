import {describe, expect, it} from 'vitest';
import {
  ReleaseEdition,
  ReleaseSourceFamily,
} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {parseWithGuessit} from '../../src/parser-test/adapters/guessit.js';
import {parseWithParsium} from '../../src/parser-test/adapters/parsium.js';
import {parseWithReleaseParser} from '../../src/parser-test/adapters/release-parser.js';
import {parseWithVideoFilenameParser} from '../../src/parser-test/adapters/video-filename-parser.js';
import {buildParsedFields} from './helpers/parsed-fields.js';

const EPISODE_NAME = 'The.Show.S01E02.1080p.NF.WEB-DL.DDP5.1.H.264-NTb';
const MOVIE_NAME = 'Movie.Name.2019.EXTENDED.1080p.BluRay.x264-SPARKS';
const REMUX_NAME = 'Movie.Name.2019.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-FGT';
const MULTI_EPISODE_NAME = 'The.Show.S02E03E04.720p.AMZN.WEBRip.x264-GRP';
const DIRECTORS_CUT_NAME =
  'Movie.Name.2019.Directors.Cut.1080p.DSNP.WEB-DL.DDP5.1.H.264-GRP';
const UNKNOWN_NAME = 'Not.In.The.Dump.2020.1080p.WEB-DL-GRP';

const EXPECTED_BY_NAME = {
  [EPISODE_NAME]: buildParsedFields({
    releaseGroup: 'ntb',
    releaseSourceFamily: ReleaseSourceFamily.WEB,
    streamingService: 'NF',
    seasonNumbers: [1],
    episodeNumbers: [2],
    releaseTitle: 'the show',
  }),
  [MOVIE_NAME]: buildParsedFields({
    releaseGroup: 'sparks',
    releaseSourceFamily: ReleaseSourceFamily.BLURAY,
    releaseEdition: ReleaseEdition.EXTENDED,
    releaseTitle: 'movie name',
    releaseYear: 2019,
  }),
  [REMUX_NAME]: buildParsedFields({
    releaseGroup: 'fgt',
    releaseSourceFamily: ReleaseSourceFamily.BLURAY,
    releaseTitle: 'movie name',
    releaseYear: 2019,
  }),
  [MULTI_EPISODE_NAME]: buildParsedFields({
    releaseGroup: 'grp',
    releaseSourceFamily: ReleaseSourceFamily.WEB,
    streamingService: 'AMZN',
    seasonNumbers: [2],
    episodeNumbers: [3, 4],
    releaseTitle: 'the show',
  }),
  [DIRECTORS_CUT_NAME]: buildParsedFields({
    releaseGroup: 'grp',
    releaseSourceFamily: ReleaseSourceFamily.WEB,
    streamingService: 'DSNP',
    releaseEdition: ReleaseEdition.DIRECTORS_CUT,
    releaseTitle: 'movie name',
    releaseYear: 2019,
  }),
};

const ADAPTER_NAMES = Object.keys(EXPECTED_BY_NAME);

const withoutService = parsedFields => ({
  ...parsedFields,
  streamingService: null,
});

const GUESSIT_OUTPUT = {
  guessitVersion: '4.5.1',
  parsedByName: {
    [EPISODE_NAME]: {
      title: 'The Show',
      season: 1,
      episode: 2,
      screen_size: '1080p',
      streaming_service: 'Netflix',
      source: 'Web',
      audio_codec: 'Dolby Digital Plus',
      video_codec: 'H.264',
      release_group: 'NTb',
      type: 'episode',
    },
    [MOVIE_NAME]: {
      title: 'Movie Name',
      year: 2019,
      edition: 'Extended',
      screen_size: '1080p',
      source: 'Blu-ray',
      video_codec: 'H.264',
      release_group: 'SPARKS',
      type: 'movie',
    },
    [REMUX_NAME]: {
      title: 'Movie Name',
      year: 2019,
      screen_size: '1080p',
      source: 'Blu-ray',
      other: 'Remux',
      release_group: 'FGT',
      type: 'movie',
    },
    [MULTI_EPISODE_NAME]: {
      title: 'The Show',
      season: 2,
      episode: [3, 4],
      screen_size: '720p',
      streaming_service: 'Amazon Prime',
      source: 'Web',
      other: 'Rip',
      release_group: 'GRP',
      type: 'episode',
    },
    [DIRECTORS_CUT_NAME]: {
      title: 'Movie Name',
      year: 2019,
      edition: "Director's Cut",
      streaming_service: 'Disney+',
      source: 'Web',
      release_group: 'GRP',
      type: 'movie',
    },
  },
};

describe('parseWithReleaseParser', () => {
  it.each(ADAPTER_NAMES)('normalises its reading of %s', releaseName => {
    expect(parseWithReleaseParser(releaseName)).toEqual(
      EXPECTED_BY_NAME[releaseName],
    );
  });
});

describe('parseWithParsium', () => {
  it.each(ADAPTER_NAMES)('normalises its reading of %s', releaseName => {
    expect(parseWithParsium(releaseName)).toEqual(
      EXPECTED_BY_NAME[releaseName],
    );
  });
});

describe('parseWithVideoFilenameParser', () => {
  it.each(ADAPTER_NAMES)(
    'normalises its reading of %s, which never names a service',
    releaseName => {
      expect(parseWithVideoFilenameParser(releaseName)).toEqual(
        withoutService(EXPECTED_BY_NAME[releaseName]),
      );
    },
  );

  it('reads an episode name with its season and episode', () => {
    expect(parseWithVideoFilenameParser(EPISODE_NAME)).toMatchObject({
      seasonNumbers: [1],
      episodeNumbers: [2],
      releaseTitle: 'the show',
    });
  });

  it('does not read a movie year as a season and an episode', () => {
    expect(parseWithVideoFilenameParser(MOVIE_NAME)).toMatchObject({
      seasonNumbers: [],
      episodeNumbers: [],
      releaseYear: 2019,
    });
  });
});

describe('parseWithGuessit', () => {
  it.each(ADAPTER_NAMES)('normalises the dumped reading of %s', releaseName => {
    expect(parseWithGuessit(releaseName, GUESSIT_OUTPUT)).toEqual(
      EXPECTED_BY_NAME[releaseName],
    );
  });

  it('refuses a name the dump does not hold', () => {
    expect(() => parseWithGuessit(UNKNOWN_NAME, GUESSIT_OUTPUT)).toThrow(
      RangeError,
    );
  });
});
