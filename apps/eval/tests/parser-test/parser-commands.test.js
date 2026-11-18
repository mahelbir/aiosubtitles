import {execFileSync} from 'node:child_process';
import {cp, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {devNull, tmpdir} from 'node:os';
import {join} from 'node:path';
import {omit} from 'es-toolkit';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {runExportDisagreements} from '../../src/commands/export-disagreements.js';
import {runExportNames} from '../../src/commands/export-names.js';
import {
  runParserTestCommand,
  writeParserReport,
} from '../../src/commands/parser-test.js';
import {REFERENCE_PROJECT_NAMES} from '../../src/parser-test/datasets/external-names.js';
import {readLibraryReadings} from '../../src/parser-test/run-parser-test.js';
import {ReportPrivacyError} from '../../src/report/write-report.js';
import {ATLAS_FIXTURE_ROOT} from '../support/atlas-fixture.js';

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

const commitReferenceCopy = async workRoot => {
  const referenceRoot = join(workRoot, 'reference');
  await cp(REFERENCE_FIXTURE_ROOT, referenceRoot, {recursive: true});
  for (const projectName of REFERENCE_PROJECT_NAMES) {
    const projectRoot = join(referenceRoot, projectName);
    runGit(projectRoot, ['init', '--quiet']);
    runGit(projectRoot, ['add', '--all']);
    runGit(projectRoot, ['commit', '--quiet', '--message', projectName]);
  }
  return referenceRoot;
};

const readJson = async filePath => JSON.parse(await readFile(filePath, 'utf8'));

const PRIVATE_FIXTURE_NAMES = [
  'Fixture Unreferenced Film (12)',
  'Fixture.Other.Video.mkv',
  'Fixture.Show.S01E01.1080p.WEB-FAKE',
];

describe('parser commands', () => {
  let workRoot;
  let referenceRoot;
  let exportLines;
  let disagreementLines;
  let reportLines;
  let reportPath;
  let namesExport;
  let pendingExport;

  beforeAll(async () => {
    workRoot = await mkdtemp(join(tmpdir(), 'eval-parser-commands-'));
    referenceRoot = await commitReferenceCopy(workRoot);
    const namesPath = join(workRoot, 'private', 'parser-names.json');
    const guessitPath = join(workRoot, 'private', 'guessit-output.json');
    const pendingPath = join(workRoot, 'private', 'pending.json');
    const labelsPath = join(workRoot, 'private', 'labels.json');
    exportLines = [];
    await runExportNames({
      atlasRoot: ATLAS_FIXTURE_ROOT,
      commandOptions: {'names-output': namesPath},
      writeLine: line => exportLines.push(line),
      referenceRoot,
    });
    namesExport = await readJson(namesPath);
    const guessitOutput = {
      guessitVersion: '4.5.1',
      parsedByName: Object.fromEntries(
        namesExport.releaseNames.map(releaseName => [
          releaseName,
          {title: releaseName.split('.')[0]},
        ]),
      ),
    };
    await writeFile(guessitPath, JSON.stringify(guessitOutput));
    disagreementLines = [];
    await runExportDisagreements({
      atlasRoot: ATLAS_FIXTURE_ROOT,
      commandOptions: {
        'guessit-output': guessitPath,
        'pending-output': pendingPath,
      },
      writeLine: line => disagreementLines.push(line),
    });
    pendingExport = await readJson(pendingPath);
    const readingsByLibrary = readLibraryReadings({
      releaseNames: namesExport.releaseNames,
      guessitOutput,
    });
    await writeFile(
      labelsPath,
      JSON.stringify({
        labels: pendingExport.pendingItems.map(({releaseName, fieldName}) => ({
          releaseName,
          fieldName,
          expectedValue: readingsByLibrary.get('parsium').get(releaseName)[
            fieldName
          ],
        })),
      }),
    );
    reportLines = [];
    reportPath = await runParserTestCommand({
      atlasRoot: ATLAS_FIXTURE_ROOT,
      commandOptions: {
        'parser-labels': labelsPath,
        'guessit-output': guessitPath,
        'report-date': '2026-11-18',
      },
      writeLine: line => reportLines.push(line),
      referenceRoot,
      reportsDir: join(workRoot, 'reports'),
    });
  }, 120_000);

  afterAll(async () => {
    await rm(workRoot, {recursive: true, force: true});
  });

  it('writes every own and external name to the names file', () => {
    expect(namesExport.releaseNames).toHaveLength(32);
    expect(namesExport.releaseNames).toEqual(
      expect.arrayContaining(PRIVATE_FIXTURE_NAMES),
    );
  });

  it('prints only name counts for the export', () => {
    expect(exportLines).toEqual([
      'own names: 13',
      'guessit names: 3',
      'sonarr names: 11',
      'ptt names: 5',
      'names written: 32',
    ]);
  });

  it('writes the pending items without readings or agreement marks', () => {
    expect(Object.keys(pendingExport)).toEqual(['pendingItems']);
    expect(pendingExport.pendingItems.length).toBeGreaterThan(0);
  });

  it('prints counts and no accuracy for the disagreements', () => {
    expect(disagreementLines).toEqual([
      'own names: 13',
      'own items: 104',
      `pending items: ${pendingExport.pendingItems.length}`,
    ]);
  });

  it('writes the dated report and prints its path and the decision', () => {
    expect(reportPath).toBe(
      join(workRoot, 'reports', '2026-11-18-name-parser.md'),
    );
    expect(reportLines).toEqual([
      `report: ${reportPath}`,
      expect.stringMatching(/^Decision: (use \S+|port guessit)$/),
    ]);
  });

  describe('the report', () => {
    let reportText;

    beforeAll(async () => {
      reportText = await readFile(reportPath, 'utf8');
    });

    it('ends with the decision line', () => {
      expect(reportText.trimEnd().split('\n').at(-1)).toBe(reportLines[1]);
    });

    it('records the versions, commits, digests and the dirty-tree mark', () => {
      expect(reportText).toContain('guessit 4.5.1');
      expect(reportText).toMatch(/@aiostreams\/release-parser \d+\.\d+\.\d+/);
      expect(reportText).toMatch(/Uncommitted source changes: (yes|no)/);
      expect(reportText).toMatch(/Labels SHA-256: [0-9a-f]{64}/);
      expect(reportText).toMatch(/Metrics SHA-256: [0-9a-f]{64}/);
      expect(reportText).toMatch(/go-ptt [0-9a-f]{40}/);
      expect(reportText).toContain(
        'Own names: 13 in all; subtitle release names by the §7.2 rule: 9; video file names: 4',
      );
    });

    it('holds per-field accuracy, the pairwise comparisons and the agreed-sample check', () => {
      expect(reportText).toContain('## Per-field accuracy');
      expect(reportText).toContain('## Pairwise comparisons');
      expect(reportText).toContain('## Agreed-sample check');
      expect(reportText).toContain('## Decision');
    });

    it('names no release name, file name, url or token', () => {
      for (const privateName of [
        ...PRIVATE_FIXTURE_NAMES,
        'Ref.Sports.2020.720p.HDTV-GRP',
      ]) {
        expect(reportText).not.toContain(privateName);
      }
      expect(reportText).not.toMatch(/https?:\/\/|auth=/);
    });
  });

  it('refuses a report that names an own release name', async () => {
    await expect(
      writeParserReport({
        atlasRoot: ATLAS_FIXTURE_ROOT,
        reportsDir: join(workRoot, 'refused'),
        reportDate: '2026-11-18',
        markdown: '| Fixture Unreferenced Film (12) | 1 |',
      }),
    ).rejects.toBeInstanceOf(ReportPrivacyError);
  });
});
