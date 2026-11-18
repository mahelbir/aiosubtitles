import {describe, expect, it} from 'vitest';
import {
  ReleaseEdition,
  ReleaseSourceFamily,
} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {parseGuessitYaml} from '../../src/parser-test/datasets/guessit-yaml.js';
import {sortNameCases} from './helpers/parsed-fields.js';

const GUESSIT_YAML = `? __default__
: type: episode

? Series/Show/Season 2/Show.2x05.Some.Title.HDTV.XviD-0TV.avi
: title: Show
  season: 2
  episode: 5
  episode_title: Some Title
  source: HDTV
  video_codec: Xvid
  release_group: 0TV
  container: avi

? Show.S01E01.WEBRip.x264-GRP
? Show.S01E01.WEB-DL.x264-GRP
: title: Show
  season: 1
  episode: 1
  source: Web
  release_group: GRP

? Movie.2001.Directors.Cut.BluRay.Remux-GRP
: title: Movie
  year: 2001
  edition: Director's Cut
  source: Blu-ray
  other: Remux
  release_group: GRP

? -Never.Matches.S01E02
: title: Wrong Title

? +Show.S03E04E05.720p
: title: Show
  season: 3
  episode: [4, 5]
  -release_group: 720p

? Film.Name.2009.DVDRip
: title: Film Name
  year: 2009
  source: DVD
  type: movie

? Show.S01E01.WEBRip.x264-GRP
: title: Show
  season: 1
  episode: 1
  source: Web
  streaming_service: Netflix
  release_group: GRP
`;

describe('parseGuessitYaml', () => {
  it('reads the asserted fields of every entry, normalised', () => {
    expect(sortNameCases(parseGuessitYaml(GUESSIT_YAML))).toEqual([
      {
        releaseName: 'Film.Name.2009.DVDRip',
        expectedFields: {
          releaseTitle: 'film name',
          releaseYear: 2009,
          releaseSourceFamily: ReleaseSourceFamily.DVD,
        },
      },
      {
        releaseName: 'Movie.2001.Directors.Cut.BluRay.Remux-GRP',
        expectedFields: {
          releaseTitle: 'movie',
          releaseYear: 2001,
          releaseEdition: ReleaseEdition.DIRECTORS_CUT,
          releaseSourceFamily: ReleaseSourceFamily.BLURAY,
          releaseGroup: 'grp',
        },
      },
      {
        releaseName:
          'Series/Show/Season 2/Show.2x05.Some.Title.HDTV.XviD-0TV.avi',
        expectedFields: {
          releaseTitle: 'show',
          seasonNumbers: [2],
          episodeNumbers: [5],
          releaseSourceFamily: ReleaseSourceFamily.HDTV,
          releaseGroup: '0tv',
        },
      },
      {
        releaseName: 'Show.S01E01.WEB-DL.x264-GRP',
        expectedFields: {
          releaseTitle: 'show',
          seasonNumbers: [1],
          episodeNumbers: [1],
          releaseSourceFamily: ReleaseSourceFamily.WEB,
          releaseGroup: 'grp',
        },
      },
      {
        releaseName: 'Show.S01E01.WEBRip.x264-GRP',
        expectedFields: {
          releaseTitle: 'show',
          seasonNumbers: [1],
          episodeNumbers: [1],
          releaseSourceFamily: ReleaseSourceFamily.WEB,
          streamingService: 'NF',
          releaseGroup: 'grp',
        },
      },
      {
        releaseName: 'Show.S03E04E05.720p',
        expectedFields: {
          releaseTitle: 'show',
          seasonNumbers: [3],
          episodeNumbers: [4, 5],
        },
      },
    ]);
  });

  it('gives a key without its own expectation the next entry’s expectation', () => {
    const nameCases = parseGuessitYaml(GUESSIT_YAML);
    expect(
      nameCases?.find(
        nameCase => nameCase.releaseName === 'Show.S01E01.WEB-DL.x264-GRP',
      )?.expectedFields.releaseGroup,
    ).toBe('grp');
  });

  it('skips the __default__ entry and negated entries', () => {
    const releaseNames = parseGuessitYaml(GUESSIT_YAML)?.map(
      nameCase => nameCase.releaseName,
    );
    expect(releaseNames).toHaveLength(6);
    expect(releaseNames).not.toContain('__default__');
    expect(releaseNames).not.toContain('-Never.Matches.S01E02');
    expect(releaseNames).not.toContain('Never.Matches.S01E02');
  });

  it('keeps one case for a repeated key, the later expectation winning', () => {
    const repeatedCases = parseGuessitYaml(GUESSIT_YAML)?.filter(
      nameCase => nameCase.releaseName === 'Show.S01E01.WEBRip.x264-GRP',
    );
    expect(repeatedCases).toHaveLength(1);
    expect(repeatedCases[0].expectedFields.streamingService).toBe('NF');
  });

  it('never asserts absence for a field the entry leaves out', () => {
    const nameCase = parseGuessitYaml(GUESSIT_YAML)?.find(
      entry => entry.releaseName === 'Show.S03E04E05.720p',
    );
    expect(Object.keys(nameCase?.expectedFields ?? {}).sort()).toEqual([
      'episodeNumbers',
      'releaseTitle',
      'seasonNumbers',
    ]);
  });
});
