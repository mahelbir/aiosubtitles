import {describe, expect, it} from 'vitest';
import {ReleaseSourceFamily} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {mergeNameCases} from '../../src/parser-test/datasets/name-cases.js';
import {
  listGoPttCases,
  listPttCases,
} from '../../src/parser-test/datasets/ptt-cases.js';
import {parseGuessitYaml} from '../../src/parser-test/datasets/guessit-yaml.js';
import {
  listSonarrCases,
  parseSonarrCases,
} from '../../src/parser-test/datasets/sonarr-cases.js';
import {buildAliasLookup} from '../../src/parser-test/normalize-fields.js';

const SONARR_QUALITY_FIXTURE = String.raw`
public class QualityParserFixture : CoreTest
{
    [TestCase("The.Series.S02E15.avi", false)]
    [TestCase("The.Series.S04E05.HDTV.XviD-LOL", false)]
    [TestCase("The.Series.2011.S02E01.WS.PDTV.x264-TLA", false)]
    public void should_parse_sdtv_quality(string title, bool proper)
    {
    }

    [TestCase("[HorribleSubs] The Series - 32 [1080p]", false)]
    [TestCase("The.Series.S01E01.1080p.WEB.DL.x264-GRP", false)]
    public void should_parse_webdl1080p_quality(string title, bool proper)
    {
    }

    [TestCase("The.Series.S01E13.NTSC.x264-CtrlSD", false)]
    [TestCase("The.Series.S03E06.DVD.Rip.XviD-WiDE", false)]
    public void should_parse_dvd_quality(string title, bool proper)
    {
    }

    [TestCase("Ref.Mini.Part.3.720p.HDTV-GRP", "Ref Mini", 3)]
    public void should_parse_mini_series_episode(string postTitle, string title, int episodeNumber)
    {
    }
}
`;

const GUESSIT_OPTIONS_YAML = `? Plain.Movie.2001.DVDRip
: title: Plain Movie
  year: 2001

? Option.Bound.2002.DVDRip
: options: --type movie
  title: Option Bound
  year: 2002
`;

describe('Sonarr quality methods', () => {
  it('asserts a family only when the name holds a source token of that family', () => {
    expect(
      parseSonarrCases(SONARR_QUALITY_FIXTURE)
        .filter(nameCase =>
          Object.hasOwn(nameCase.expectedFields, 'releaseSourceFamily'),
        )
        .map(nameCase => [
          nameCase.releaseName,
          nameCase.expectedFields.releaseSourceFamily,
        ])
        .toSorted(),
    ).toEqual(
      [
        ['The.Series.S04E05.HDTV.XviD-LOL', ReleaseSourceFamily.HDTV],
        ['The.Series.2011.S02E01.WS.PDTV.x264-TLA', ReleaseSourceFamily.HDTV],
        ['The.Series.S01E01.1080p.WEB.DL.x264-GRP', ReleaseSourceFamily.WEB],
        ['The.Series.S03E06.DVD.Rip.XviD-WiDE', ReleaseSourceFamily.DVD],
      ].toSorted(),
    );
  });

  it('asserts no season for a mini-series episode, because the name holds none', () => {
    expect(
      parseSonarrCases(SONARR_QUALITY_FIXTURE).find(
        nameCase => nameCase.releaseName === 'Ref.Mini.Part.3.720p.HDTV-GRP',
      )?.expectedFields,
    ).toEqual({releaseTitle: 'ref mini', episodeNumbers: [3]});
  });
});

describe('guessit option-bound entries', () => {
  it('drops an entry whose expectation needs guessit options', () => {
    expect(
      parseGuessitYaml(GUESSIT_OPTIONS_YAML).map(
        nameCase => nameCase.releaseName,
      ),
    ).toEqual(['Plain.Movie.2001.DVDRip']);
  });
});

describe('several canonical editions in one source', () => {
  it('drops the edition item and marks the case', () => {
    expect(
      parseGuessitYaml(
        "? Two.Editions.2002-GRP\n: title: Two Editions\n  edition: [Unrated, Director's Cut]\n",
      ),
    ).toEqual([
      {
        releaseName: 'Two.Editions.2002-GRP',
        expectedFields: {releaseTitle: 'two editions'},
        hasDroppedEdition: true,
      },
    ]);
  });

  it('keeps one canonical edition among editions outside the set', () => {
    expect(
      parseGuessitYaml(
        '? One.Edition.2003-GRP\n: title: One Edition\n  edition: [Limited, Extended]\n',
      ),
    ).toEqual([
      {
        releaseName: 'One.Edition.2003-GRP',
        expectedFields: {
          releaseTitle: 'one edition',
          releaseEdition: 'extended',
        },
      },
    ]);
  });

  it('drops an edition another source asserted when one source dropped it', () => {
    expect(
      mergeNameCases([
        {
          releaseName: 'Two.Sources',
          expectedFields: {releaseEdition: 'unrated', releaseYear: 2001},
        },
        {
          releaseName: 'Two.Sources',
          expectedFields: {releaseYear: 2001},
          hasDroppedEdition: true,
        },
      ]),
    ).toEqual([
      {
        releaseName: 'Two.Sources',
        expectedFields: {releaseYear: 2001},
        hasDroppedEdition: true,
      },
    ]);
  });

  it('keeps the mark through a merge', () => {
    expect(
      mergeNameCases([
        {
          releaseName: 'Kept.Name',
          expectedFields: {releaseYear: 2001},
          hasDroppedEdition: true,
        },
        {releaseName: 'Kept.Name', expectedFields: {releaseYear: 2001}},
      ]),
    ).toEqual([
      {
        releaseName: 'Kept.Name',
        expectedFields: {releaseYear: 2001},
        hasDroppedEdition: true,
      },
    ]);
  });
});

describe('guessit trailing keys', () => {
  it('reads nothing for a last key without any expectation after it', () => {
    expect(parseGuessitYaml('? Lonely.Key.2001\n')).toEqual([]);
  });
});

describe('merging once over unmerged cases', () => {
  it('keeps a field dropped for a conflict even when a later file asserts it again', () => {
    const firstFile = String.raw`
    [TestCase("Ref.Series.S01E01.720p.HDTV-GRP", "Ref Series", 1, 1)]
    [TestCase("Ref.Series.S01E01.720p.HDTV-GRP", "Ref Series Other", 1, 1)]
    public void should_parse_single_episode(string postTitle, string title, int seasonNumber, int episodeNumber)
    {
    }`;
    const secondFile = String.raw`
    [TestCase("Ref.Series.S01E01.720p.HDTV-GRP", "Ref Series")]
    public void should_parse_series_name(string postTitle, string title)
    {
    }`;
    expect(
      mergeNameCases([
        ...listSonarrCases(firstFile),
        ...listSonarrCases(secondFile),
      ]),
    ).toEqual([
      {
        releaseName: 'Ref.Series.S01E01.720p.HDTV-GRP',
        expectedFields: {seasonNumbers: [1], episodeNumbers: [1]},
      },
    ]);
  });

  it('lists PTT and go-ptt cases unmerged', () => {
    const pyText = `@pytest.mark.parametrize("release_name, expected_group", [
    ("Ref.Name-GRP", "GRP"),
    ("Ref.Name-GRP", "OTHER"),
])
def test_group(parser, release_name, expected_group):
    pass
`;
    const goText = `func TestGroup(t *testing.T) {
	for _, tc := range []struct {
		ttitle string
		group  string
	}{
		{"Ref.Name-GRP", "GRP"},
	} {
		assert.Equal(t, tc.group, Parse(tc.ttitle).Group)
	}
}
`;
    expect(listPttCases(pyText)).toHaveLength(2);
    expect(listGoPttCases(goText)).toHaveLength(1);
    expect(
      mergeNameCases([...listPttCases(pyText), ...listGoPttCases(goText)]),
    ).toEqual([]);
  });
});

describe('buildAliasLookup', () => {
  it('maps every alias and the canonical value through the key function', () => {
    expect(
      buildAliasLookup({NF: ['Netflix']}, aliasText => aliasText.toLowerCase()),
    ).toEqual(
      new Map([
        ['nf', 'NF'],
        ['netflix', 'NF'],
      ]),
    );
  });

  it('refuses one key that two canonical values claim', () => {
    expect(() =>
      buildAliasLookup({NF: ['Netflix'], NFX: ['netflix']}, aliasText =>
        aliasText.toLowerCase(),
      ),
    ).toThrow(RangeError);
  });
});
