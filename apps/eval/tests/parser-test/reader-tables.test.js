import {execFileSync} from 'node:child_process';
import {mkdir, mkdtemp, realpath, rm, writeFile} from 'node:fs/promises';
import {devNull, tmpdir} from 'node:os';
import {join} from 'node:path';
import {omit} from 'es-toolkit';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  ReleaseEdition,
  ReleaseSourceFamily,
} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {
  getLabelReleaseNames,
  readFrozenLists,
} from '../../src/corpus/frozen-lists.js';
import {
  ReferenceRootError,
  resolveReferenceRoot,
} from '../../src/parser-test/datasets/external-names.js';
import {
  parseGoPttCases,
  parsePttCases,
} from '../../src/parser-test/datasets/ptt-cases.js';
import {parseSonarrCases} from '../../src/parser-test/datasets/sonarr-cases.js';
import {
  createLiteralReader,
  SourceLiteralError,
  tokenizeSource,
} from '../../src/parser-test/datasets/source-literals.js';

const sonarrMethod = (methodName, parameters, testCases) => `
    ${testCases.map(testCase => `[TestCase(${testCase})]`).join('\n    ')}
    public void ${methodName}(${parameters})
    {
    }
`;

const SONARR_TABLE_FIXTURE = [
  sonarrMethod(
    'should_parse_split_episode',
    'string postTitle, string title, int seasonNumber, int episodeNumber',
    ['"Split.Show.S01E05a.720p-GRP", "Split Show", 1, 5'],
  ),
  sonarrMethod(
    'should_parse_japanese_variety_show_format',
    'string postTitle, string title, int seasonNumber, int episodeNumber',
    ['"Variety Show S02E10", "Variety Show", 2, 10'],
  ),
  sonarrMethod(
    'should_parse_multi_episode_release',
    'string postTitle, string title, string releaseGroup, int season, int[] episodes',
    ['"Multi.Show.S03E01E02.720p-GRP", "Multi Show", "GRP", 3, new[] { 1, 2 }'],
  ),
  sonarrMethod(
    'should_parse_multi_episode_from_path',
    'string path, string title, int season, int[] episodes',
    ['@"C:\\Shows\\Path Show\\S01E03-E04.mkv", "Path Show", 1, new[] { 3, 4 }'],
  ),
  sonarrMethod(
    'should_parse_from_path',
    'string path, int season, int episode',
    ['@"C:\\Shows\\Season 4\\Episode 7.mkv", 4, 7'],
  ),
  sonarrMethod(
    'should_parse_season_subpack',
    'string postTitle, string title, int season',
    ['"Subpack.Show.S02.Extras.720p-GRP", "Subpack Show", 2'],
  ),
  sonarrMethod(
    'should_parse_season_extras',
    'string postTitle, string title, int season',
    ['"Extras.Show.S03.Extras-GRP", "Extras Show", 3'],
  ),
  sonarrMethod(
    'should_parse_partial_season_release',
    'string postTitle, string title, int season, int seasonPart',
    ['"Partial.Show.S04.Part.1-GRP", "Partial Show", 4, 1'],
  ),
  sonarrMethod(
    'should_parse_full_season_releases',
    'string postTitle, string title, string releaseGroup, int season',
    ['"Full.Show.S05.1080p-GRP", "Full Show", "GRP", 5'],
  ),
  sonarrMethod('should_parse_series_name', 'string postTitle, string title', [
    '"Name.Only.Show.S01E01", "Name Only Show"',
  ]),
  sonarrMethod(
    'should_parse_exception_release_group',
    'string title, string expected',
    ['"Exception.Show.S01E01-D-Z0N3", "D-Z0N3"'],
  ),
  sonarrMethod(
    'should_parse_anime_release_groups',
    'string title, string expected',
    ['"[SubsPlease] Anime Show - 01", "SubsPlease"'],
  ),
  sonarrMethod(
    'should_parse_sub_group_from_title_as_release_group',
    'string title, string expected',
    ['"[Erai-raws] Sub Show - 02", "Erai-raws"'],
  ),
  sonarrMethod('should_parse_webrip720p_quality', 'string title, bool proper', [
    '"Rip.Show.S01E01.720p.WEBRip-GRP", false',
  ]),
  sonarrMethod(
    'should_parse_bluray2160p_quality',
    'string title, bool proper',
    ['"Disc.Show.S01E01.2160p.BluRay-GRP", false'],
  ),
  sonarrMethod('should_parse_hdtv1080p_quality', 'string title, bool proper', [
    '"Air.Show.S01E01.1080p.HDTV-GRP", false',
  ]),
  sonarrMethod('should_parse_raw_quality', 'string title, bool proper', [
    '"Raw.Show.S01E01.1080i.HDTV.MPA2.0-GRP", false',
  ]),
].join('');

describe('the Sonarr method table', () => {
  it('reads each method row into its fields', () => {
    expect(
      Object.fromEntries(
        parseSonarrCases(SONARR_TABLE_FIXTURE).map(
          ({releaseName, expectedFields}) => [releaseName, expectedFields],
        ),
      ),
    ).toEqual({
      'Split.Show.S01E05a.720p-GRP': {
        releaseTitle: 'split show',
        seasonNumbers: [1],
        episodeNumbers: [5],
      },
      'Variety Show S02E10': {
        releaseTitle: 'variety show',
        seasonNumbers: [2],
        episodeNumbers: [10],
      },
      'Multi.Show.S03E01E02.720p-GRP': {
        releaseGroup: 'grp',
        releaseTitle: 'multi show',
        seasonNumbers: [3],
        episodeNumbers: [1, 2],
      },
      [String.raw`C:\Shows\Path Show\S01E03-E04.mkv`]: {
        releaseTitle: 'path show',
        seasonNumbers: [1],
        episodeNumbers: [3, 4],
      },
      [String.raw`C:\Shows\Season 4\Episode 7.mkv`]: {
        seasonNumbers: [4],
        episodeNumbers: [7],
      },
      'Subpack.Show.S02.Extras.720p-GRP': {
        releaseTitle: 'subpack show',
        seasonNumbers: [2],
        episodeNumbers: [],
      },
      'Extras.Show.S03.Extras-GRP': {
        releaseTitle: 'extras show',
        seasonNumbers: [3],
        episodeNumbers: [],
      },
      'Partial.Show.S04.Part.1-GRP': {
        releaseTitle: 'partial show',
        seasonNumbers: [4],
        episodeNumbers: [],
      },
      'Full.Show.S05.1080p-GRP': {
        releaseGroup: 'grp',
        releaseTitle: 'full show',
        seasonNumbers: [5],
        episodeNumbers: [],
      },
      'Name.Only.Show.S01E01': {releaseTitle: 'name only show'},
      'Exception.Show.S01E01-D-Z0N3': {releaseGroup: 'd-z0n3'},
      '[SubsPlease] Anime Show - 01': {releaseGroup: 'subsplease'},
      '[Erai-raws] Sub Show - 02': {releaseGroup: 'erai-raws'},
      'Rip.Show.S01E01.720p.WEBRip-GRP': {
        releaseSourceFamily: ReleaseSourceFamily.WEB,
      },
      'Disc.Show.S01E01.2160p.BluRay-GRP': {
        releaseSourceFamily: ReleaseSourceFamily.BLURAY,
      },
      'Air.Show.S01E01.1080p.HDTV-GRP': {
        releaseSourceFamily: ReleaseSourceFamily.HDTV,
      },
    });
  });

  it('skips a named argument of a test case', () => {
    expect(
      parseSonarrCases(
        sonarrMethod(
          'should_parse_series_name',
          'string postTitle, string title',
          ['"Named.Show.S01E01", "Named Show", Description = "a note"'],
        ),
      ),
    ).toEqual([
      {
        releaseName: 'Named.Show.S01E01',
        expectedFields: {releaseTitle: 'named show'},
      },
    ]);
  });
});

describe('the PTT column table', () => {
  it('reads every mapped column and its absence rule', () => {
    const pyText = `
@pytest.mark.parametrize("release_name, expected_title, expected_seasons, expected_episode, expected_quality, expected_network, expected_edition", [
    ("Col.Show.S01E02.WEB-DL", "Col Show", [1], [2], "WEB-DL", None, "Extended Edition"),
    ("Col.Empty", None, [], [], None, None, None),
])
def test_columns(parser, release_name, expected_title, expected_seasons, expected_episode, expected_quality, expected_network, expected_edition):
    pass

@pytest.mark.parametrize("title, expected_group", [
    ("Not.A.Release.Name.Block", "GRP"),
])
def test_other(parser, title, expected_group):
    pass

@pytest.mark.parametrize("release_name, expected_output", [
    ("Whole.Movie.2010.EXTENDED.REMASTERED.BluRay-GRP", {
        "title": "Whole Movie",
        "year": 2010,
        "extended": True,
        "remastered": True,
        "quality": "BluRay",
        "group": "GRP",
        "network": "Hulu",
        "seasons": [],
        "episodes": [],
    }),
])
def test_whole(parser, release_name, expected_output):
    pass
`;
    expect(
      Object.fromEntries(
        parsePttCases(pyText).map(({releaseName, expectedFields}) => [
          releaseName,
          expectedFields,
        ]),
      ),
    ).toEqual({
      'Col.Show.S01E02.WEB-DL': {
        releaseTitle: 'col show',
        seasonNumbers: [1],
        episodeNumbers: [2],
        releaseSourceFamily: ReleaseSourceFamily.WEB,
        streamingService: null,
        releaseEdition: ReleaseEdition.EXTENDED,
      },
      'Col.Empty': {
        seasonNumbers: [],
        episodeNumbers: [],
        releaseSourceFamily: null,
        streamingService: null,
        releaseEdition: null,
      },
      'Whole.Movie.2010.EXTENDED.REMASTERED.BluRay-GRP': {
        releaseGroup: 'grp',
        releaseSourceFamily: ReleaseSourceFamily.BLURAY,
        streamingService: 'HULU',
        seasonNumbers: [],
        episodeNumbers: [],
        releaseTitle: 'whole movie',
        releaseYear: 2010,
      },
    });
  });
});

describe('the go-ptt column table', () => {
  it('reads the columns its test body uses, keyed rows and Result rows', () => {
    const goText = `
func TestTable(t *testing.T) {
	for _, tc := range []struct {
		ttitle   string
		episodes []int
		quality  string
		year     string
	}{
		{"Go.Show.S01E04.HDTV", []int{4}, "HDTV", ""},
	} {
		result := Parse(tc.ttitle)
		assert.Equal(t, tc.episodes, result.Episodes)
		assert.Equal(t, tc.quality, result.Quality)
		assert.Equal(t, tc.year, result.Year)
	}
	for _, tc := range []struct {
		ttitle string
		result Result
	}{
		{"Go.Movie.2011.DVDRip", Result{
			Title:    "Go Movie",
			Year:     "2011",
			Quality:  "DVDRip",
			Edition:  "Director's Cut",
			Unrated:  true,
			Episodes: nil,
		}},
	} {
		assert.Equal(t, &tc.result, Parse(tc.ttitle))
	}
	for _, tc := range []struct {
		input  Result
		output Result
	}{
		{Result{Title: "Not.A.Name.Table"}, Result{Title: "x"}},
	} {
		assert.Equal(t, tc.output, tc.input)
	}
}
`;
    expect(
      Object.fromEntries(
        parseGoPttCases(goText).map(({releaseName, expectedFields}) => [
          releaseName,
          expectedFields,
        ]),
      ),
    ).toEqual({
      'Go.Show.S01E04.HDTV': {
        episodeNumbers: [4],
        releaseSourceFamily: ReleaseSourceFamily.HDTV,
        releaseYear: null,
      },
      'Go.Movie.2011.DVDRip': {
        releaseGroup: null,
        releaseSourceFamily: ReleaseSourceFamily.DVD,
        streamingService: null,
        seasonNumbers: [],
        episodeNumbers: [],
        releaseTitle: 'go movie',
        releaseYear: 2011,
      },
    });
  });
});

describe('source literals', () => {
  it('refuses an unclosed string', () => {
    expect(() => tokenizeSource('("Open.Name', {commentStyle: 'hash'})).toThrow(
      SourceLiteralError,
    );
  });

  it('refuses a token that starts no literal', () => {
    expect(() =>
      createLiteralReader(
        tokenizeSource('= 1', {commentStyle: 'hash'}),
      ).readValue(),
    ).toThrow(SourceLiteralError);
  });

  it('refuses a literal that runs past the end of the source', () => {
    expect(() =>
      createLiteralReader(
        tokenizeSource('("a", "b"', {commentStyle: 'hash'}),
      ).readValue(),
    ).toThrow(SourceLiteralError);
  });

  it.each([
    ['an unclosed call', 'Language.Parse("en"'],
    ['a construction that is not an array', 'new Episode("x")'],
  ])('refuses %s', (_, sourceText) => {
    expect(() =>
      createLiteralReader(
        tokenizeSource(sourceText, {commentStyle: 'slash'}),
      ).readValue(),
    ).toThrow(SourceLiteralError);
  });

  it('joins adjacent strings, skips nested calls and a closing comment', () => {
    expect(
      createLiteralReader(
        tokenizeSource('("Joined." "Name", Language.Parse(("en"))) # end', {
          commentStyle: 'hash',
        }),
      ).readValue(),
    ).toEqual(['Joined.Name', {qualifiedName: 'Language.Parse'}]);
  });

  it('reads escapes, verbatim and raw strings, and Go type conversions', () => {
    const rawGoString = '`raw\\n`';
    const literalReader = createLiteralReader(
      tokenizeSource(
        String.raw`("T\u00fcrk\xe7e\n", @"C:\path", ${rawGoString}, []string(nil), new int[0], Quality.HDTV720p, Language.Parse("en"))`,
        {commentStyle: 'slash'},
      ),
    );
    expect(literalReader.readValue()).toEqual([
      'Türkçe\n',
      String.raw`C:\path`,
      String.raw`raw\n`,
      null,
      [],
      {qualifiedName: 'Quality.HDTV720p'},
      {qualifiedName: 'Language.Parse'},
    ]);
  });
});

describe('frozen list edge cases', () => {
  it('reads no name from a label without the names separator', () => {
    expect(getLabelReleaseNames('[SubDL] no separator here')).toEqual([]);
  });

  it('skips a blob that starts like JSON but does not parse', async () => {
    const atlasRoot = await mkdtemp(join(tmpdir(), 'eval-frozen-'));
    const blobFolder = join(
      atlasRoot,
      'eval',
      'cache',
      'frozen',
      'sha256',
      'ab',
    );
    await mkdir(blobFolder, {recursive: true});
    await writeFile(join(blobFolder, 'ab01'), '{"subtitles": [', 'utf8');
    try {
      expect(await readFrozenLists(atlasRoot)).toEqual([]);
    } finally {
      await rm(atlasRoot, {recursive: true, force: true});
    }
  });
});

const GIT_SAFE_ENV = omit(process.env, [
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_WORK_TREE',
]);

const runFixtureGit = (repositoryRoot, gitArgs) =>
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgsign=false',
      '-c',
      `core.hooksPath=${devNull}`,
      ...gitArgs,
    ],
    {cwd: repositoryRoot, encoding: 'utf8', env: GIT_SAFE_ENV},
  ).trim();

describe('resolveReferenceRoot', () => {
  let workRoot;
  let mainRoot;
  let worktreeRoot;

  beforeAll(async () => {
    workRoot = await realpath(await mkdtemp(join(tmpdir(), 'eval-root-')));
    mainRoot = join(workRoot, 'main');
    worktreeRoot = join(workRoot, 'worktrees', 'feature');
    await mkdir(mainRoot, {recursive: true});
    await writeFile(join(mainRoot, 'README.md'), '# main\n');
    runFixtureGit(mainRoot, ['init', '--quiet']);
    runFixtureGit(mainRoot, ['add', '--all']);
    runFixtureGit(mainRoot, ['commit', '--quiet', '--message', 'main']);
    runFixtureGit(mainRoot, [
      'worktree',
      'add',
      '--quiet',
      '-b',
      'feature',
      worktreeRoot,
    ]);
  });

  afterAll(async () => {
    await rm(workRoot, {recursive: true, force: true});
  });

  it('refuses when the main checkout holds no .reference folder', () => {
    expect(() => resolveReferenceRoot({startDirectory: worktreeRoot})).toThrow(
      ReferenceRootError,
    );
  });

  it('finds the .reference folder beside the main checkout from a worktree', async () => {
    await mkdir(join(mainRoot, '.reference'));
    expect(resolveReferenceRoot({startDirectory: worktreeRoot})).toBe(
      join(mainRoot, '.reference'),
    );
    expect(resolveReferenceRoot({startDirectory: mainRoot})).toBe(
      join(mainRoot, '.reference'),
    );
  });
});
