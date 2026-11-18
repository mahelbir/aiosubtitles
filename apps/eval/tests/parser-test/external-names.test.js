import {execFileSync} from 'node:child_process';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {devNull, tmpdir} from 'node:os';
import {join} from 'node:path';
import {omit} from 'es-toolkit';
import {afterEach, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {ReleaseSourceFamily} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {
  readExternalNameCases,
  readReferenceCommits,
  ReferenceRootError,
  REFERENCE_PROJECT_NAMES,
} from '../../src/parser-test/datasets/external-names.js';
import {sortNameCases} from './helpers/parsed-fields.js';

const REFERENCE_FIXTURE_ROOT = join(
  import.meta.dirname,
  '..',
  'fixtures',
  'reference-mini',
);

const GIT_SAFE_ENV = omit(process.env, [
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_WORK_TREE',
]);

const runGit = (repositoryRoot, gitArgs) =>
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

describe('readExternalNameCases', () => {
  let externalNameCases;
  let droppedEditionCountByDataset;

  beforeAll(async () => {
    ({nameCasesByDataset: externalNameCases, droppedEditionCountByDataset} =
      await readExternalNameCases({referenceRoot: REFERENCE_FIXTURE_ROOT}));
  });

  it('counts per set the names whose edition item was dropped', () => {
    expect(droppedEditionCountByDataset).toEqual({
      guessit: 1,
      sonarr: 0,
      ptt: 0,
    });
  });

  it('reads the three guessit protocol files and merges a name across them', () => {
    expect(sortNameCases(externalNameCases.guessit)).toEqual([
      {
        releaseName: 'Ref.Movie.2001.Limited.DVDRip-GRP',
        expectedFields: {
          releaseTitle: 'ref movie',
          releaseYear: 2001,
          releaseSourceFamily: ReleaseSourceFamily.DVD,
          releaseGroup: 'grp',
        },
      },
      {
        releaseName: 'Ref.Movie.2002.Unrated.Directors.Cut.BluRay-GRP',
        expectedFields: {
          releaseTitle: 'ref movie',
          releaseYear: 2002,
          releaseSourceFamily: ReleaseSourceFamily.BLURAY,
        },
        hasDroppedEdition: true,
      },
      {
        releaseName: 'Ref.Show.S01E02.HDTV-GRP',
        expectedFields: {
          releaseTitle: 'ref show',
          seasonNumbers: [1],
          episodeNumbers: [2],
          releaseSourceFamily: ReleaseSourceFamily.HDTV,
          releaseGroup: 'grp',
        },
      },
    ]);
  });

  it('reads the top-level Sonarr parser fixtures through the method table', () => {
    expect(sortNameCases(externalNameCases.sonarr)).toEqual(
      sortNameCases([
        {
          releaseName: 'Ref.Series.S01.720p.HDTV-GRP',
          expectedFields: {
            releaseTitle: 'ref series',
            seasonNumbers: [1],
            episodeNumbers: [],
          },
        },
        {
          releaseName: 'Ref.Series.S01-S03.720p.HDTV-GRP',
          expectedFields: {
            releaseTitle: 'ref series',
            seasonNumbers: [1, 2, 3],
            episodeNumbers: [],
          },
        },
        {
          releaseName: 'Ref.Series.S02E03E04.720p.HDTV-GRP',
          expectedFields: {
            releaseTitle: 'ref series',
            seasonNumbers: [2],
            episodeNumbers: [3, 4],
          },
        },
        {
          releaseName: 'Ref Series 2010 S01E01',
          expectedFields: {releaseTitle: 'ref series', releaseYear: 2010},
        },
        {
          releaseName: 'Ref Series S01E01',
          expectedFields: {releaseTitle: 'ref series', releaseYear: null},
        },
        {
          releaseName: 'Ref.Mini.Part.3.720p.HDTV-GRP',
          expectedFields: {
            releaseTitle: 'ref mini',
            episodeNumbers: [3],
          },
        },
        {
          releaseName: 'Ref.Series.S01E01.720p.BluRay.REMUX-GRP',
          expectedFields: {releaseSourceFamily: ReleaseSourceFamily.BLURAY},
        },
        {
          releaseName: 'Ref.Series.S01E01.PDTV-GRP',
          expectedFields: {releaseSourceFamily: ReleaseSourceFamily.HDTV},
        },
        {
          releaseName: 'Ref.Series.S01E01.DVDRip-GRP',
          expectedFields: {releaseSourceFamily: ReleaseSourceFamily.DVD},
        },
        {
          releaseName: String.raw`C:\Test\Ref.Series.S01E01.720p.HDTV-GRP\abc123.mkv`,
          expectedFields: {releaseTitle: 'ref series', releaseGroup: 'grp'},
        },
        {
          releaseName: 'Ref.Series.S01E01.720p.HDTV-GRP',
          expectedFields: {seasonNumbers: [1], episodeNumbers: [1]},
        },
      ]),
    );
  });

  it('merges PTT and go-ptt into one set and drops a field they disagree on', () => {
    expect(sortNameCases(externalNameCases.ptt)).toEqual([
      {
        releaseName: 'Ref.Extra.2021.1080p.HULU.WEB-DL-GRP',
        expectedFields: {streamingService: 'HULU', releaseTitle: 'ref extra'},
      },
      {
        releaseName: 'Ref.Film.2020.720p.AMZN.WEBRip-GRP',
        expectedFields: {streamingService: 'AMZN'},
      },
      {
        releaseName: 'Ref.Keyed.2021.720p.NF.WEB-DL-GRP',
        expectedFields: {streamingService: 'NF'},
      },
      {
        releaseName: 'Ref.Other.2020.720p.WEBRip-GRP',
        expectedFields: {streamingService: null},
      },
      {
        releaseName: 'Ref.Sports.2020.720p.HDTV-GRP',
        expectedFields: {
          releaseGroup: 'grp',
          releaseSourceFamily: ReleaseSourceFamily.HDTV,
          releaseTitle: 'ref sports',
          releaseYear: 2020,
        },
      },
    ]);
  });

  it('reads an expected dict as the fields it names, not a whole result', () => {
    expect(
      externalNameCases.ptt.find(
        nameCase => nameCase.releaseName === 'Ref.Sports.2020.720p.HDTV-GRP',
      )?.expectedFields,
    ).not.toHaveProperty('seasonNumbers');
  });

  it('reads no go-ptt column the test body leaves unused', () => {
    expect(
      externalNameCases.ptt.map(nameCase => nameCase.releaseName),
    ).not.toContain('Ref.Audio.Only.2020.720p.AAC-GRP');
  });

  it('reads no name from files outside the protocol', () => {
    const releaseNames = Object.values(externalNameCases)
      .flat()
      .map(nameCase => nameCase.releaseName);
    expect(releaseNames).not.toContain('Ref.Not.Read.From.Rules.2003');
    expect(releaseNames).not.toContain('Ref.Nested.Not.Read.S01E01');
    expect(releaseNames).not.toContain('Ref.Not.A.Test.File.2020-GRP');
    expect(releaseNames).not.toContain('Ref.Not.Read.From.Source.2020-GRP');
    expect(releaseNames).not.toContain('Ref.Commented.S02.720p.HDTV-GRP');
  });

  it('asserts nothing from a lone boolean edition column', () => {
    expect(
      externalNameCases.ptt.map(nameCase => nameCase.releaseName),
    ).not.toContain('Ref.Film.2020.UNRATED.720p.WEBRip-GRP');
  });
});

describe('readReferenceCommits', () => {
  let referenceRoot;

  beforeEach(async () => {
    referenceRoot = await mkdtemp(join(tmpdir(), 'eval-reference-'));
  });

  afterEach(async () => {
    await rm(referenceRoot, {recursive: true, force: true});
  });

  const createProjectRepository = async projectName => {
    const projectRoot = join(referenceRoot, projectName);
    await mkdir(projectRoot, {recursive: true});
    await writeFile(join(projectRoot, 'README.md'), `# ${projectName}\n`);
    runGit(projectRoot, ['init', '--quiet']);
    runGit(projectRoot, ['add', '--all']);
    runGit(projectRoot, ['commit', '--quiet', '--message', projectName]);
    return runGit(projectRoot, ['rev-parse', 'HEAD']);
  };

  it('records the HEAD commit of each reference project', async () => {
    const commitByProject = {};
    for (const projectName of REFERENCE_PROJECT_NAMES) {
      commitByProject[projectName] = await createProjectRepository(projectName);
    }
    expect(readReferenceCommits({referenceRoot})).toEqual(commitByProject);
  });

  it('refuses a reference project with uncommitted changes', async () => {
    for (const projectName of REFERENCE_PROJECT_NAMES) {
      await createProjectRepository(projectName);
    }
    await writeFile(join(referenceRoot, 'PTT', 'README.md'), '# edited\n');
    expect(() => readReferenceCommits({referenceRoot})).toThrow(
      ReferenceRootError,
    );
  });

  it('refuses a project folder outside any repository', async () => {
    for (const projectName of REFERENCE_PROJECT_NAMES) {
      await mkdir(join(referenceRoot, projectName), {recursive: true});
    }
    expect(() => readReferenceCommits({referenceRoot})).toThrow(
      'A reference project is not a git repository.',
    );
  });

  it('refuses a project folder that is not its own repository', async () => {
    runGit(referenceRoot, ['init', '--quiet']);
    for (const projectName of REFERENCE_PROJECT_NAMES) {
      await mkdir(join(referenceRoot, projectName), {recursive: true});
    }
    expect(() => readReferenceCommits({referenceRoot})).toThrow(
      ReferenceRootError,
    );
  });
});
