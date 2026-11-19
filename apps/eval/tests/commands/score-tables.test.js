import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {AIOSUBTITLES_SCORE_TABLE} from '@repo/subtitle-core/scoring/aiosubtitles-score-table.js';
import {DEFAULT_TIMING_SETTINGS} from '@repo/subtitle-core/timing/compare-cue-timings.js';
import {
  EVAL_COMMANDS,
  EvalUsageError,
  parseEvalArgs,
} from '../../src/cli-args.js';
import {runScoreTablesCommand} from '../../src/commands/score-tables.js';
import {
  computeCorpusFingerprint,
  getCodeFingerprint,
} from '../../src/report/fingerprint.js';
import {READY_MADE_SCORE_TABLES} from '../../src/score-tables/ready-made-score-tables.js';
import {
  FIXTURE_PRIVATE_VALUES,
  ATLAS_FIXTURE_ROOT,
} from '../support/atlas-fixture.js';

const REPORT_DATE = '2026-11-18';
const REPORT_FILE_NAME = `${REPORT_DATE}-ready-made-tables.md`;

const LEAKED_FRAGMENTS = [
  ...FIXTURE_PRIVATE_VALUES,
  'Fixture',
  'FAKE-AUTH',
  'auth=',
  '://',
  'pool.example',
  'V90/c',
  'V92/c',
  'a1a1a1a1',
  '1111111111111111',
  '1111222233334444',
];

const SCORE_TABLE_NAMES = [
  AIOSUBTITLES_SCORE_TABLE,
  ...READY_MADE_SCORE_TABLES,
].map(scoreTable => scoreTable.tableName);

const runIntoTemporaryDir = async workRoot => {
  const reportsDir = await mkdtemp(join(workRoot, 'reports-'));
  const writtenLines = [];
  const reportPath = await runScoreTablesCommand({
    atlasRoot: ATLAS_FIXTURE_ROOT,
    commandOptions: {'report-date': REPORT_DATE},
    writeLine: line => writtenLines.push(line),
    reportsDir,
  });
  return {
    reportsDir,
    reportPath,
    writtenLines,
    reportText: await readFile(
      join(reportsDir, REPORT_FILE_NAME),
      'utf8',
    ).catch(() => null),
  };
};

describe('runScoreTablesCommand', () => {
  let workRoot;
  let firstRun;
  let secondRun;

  beforeAll(async () => {
    workRoot = await mkdtemp(join(tmpdir(), 'eval-score-tables-'));
    firstRun = await runIntoTemporaryDir(workRoot);
    secondRun = await runIntoTemporaryDir(workRoot);
  }, 120_000);

  afterAll(async () => {
    await rm(workRoot, {recursive: true, force: true});
  });

  const readReportText = () => firstRun.reportText ?? '';

  const readHeader = () => readReportText().split('\n## ')[0];

  const findLines = pattern =>
    readReportText()
      .split('\n')
      .filter(reportLine => pattern.test(reportLine));

  it('writes the dated ready-made tables report and names its path', () => {
    expect(firstRun.reportPath).toBe(
      join(firstRun.reportsDir, REPORT_FILE_NAME),
    );
    expect(firstRun.writtenLines[0]).toBe(`report: ${firstRun.reportPath}`);
    expect(readReportText()).toContain('V90');
    expect(readReportText()).toContain('V92');
  });

  it('writes the same bytes when it runs again on unchanged code', () => {
    expect(firstRun.reportText).not.toBeNull();
    expect(secondRun.reportText).toBe(firstRun.reportText);
  });

  it('never writes a URL, token, release name, file name or hash into the report', () => {
    expect(firstRun.reportText).not.toBeNull();
    for (const leakedFragment of LEAKED_FRAGMENTS) {
      expect(firstRun.reportText).not.toContain(leakedFragment);
    }
  });

  it('reports every score table and the served-order baseline', () => {
    for (const tableName of SCORE_TABLE_NAMES) {
      expect(readReportText()).toContain(tableName);
    }
    expect(readReportText()).toMatch(/served order/i);
  });

  it('records the code tree hashes and the corpus fingerprint in the header', async () => {
    const codeFingerprint = getCodeFingerprint();
    const corpusFingerprint = await computeCorpusFingerprint({
      atlasRoot: ATLAS_FIXTURE_ROOT,
      caseCodes: ['V90', 'V92'],
    });

    expect(readHeader()).toContain(codeFingerprint.evalSourceTree);
    expect(readHeader()).toContain(codeFingerprint.subtitleCoreSourceTree);
    expect(readHeader()).toContain(corpusFingerprint.indexSha256);
    expect(readHeader()).toContain(corpusFingerprint.metricsSha256);
  });

  it('names the placeholder cue-shape limits in the header', () => {
    const cueShapeLines = readHeader()
      .split('\n')
      .filter(headerLine => headerLine.includes('cue-shape'));

    expect(cueShapeLines.join('\n')).toMatch(/placeholder/i);
    expect(cueShapeLines.join('\n')).toContain('0.5');
    expect(cueShapeLines.join('\n')).toContain('1.25');
  });

  it('records the fixed time-family offset and ratio limits in the header (metrics §5.3)', () => {
    const headerLines = readHeader().split('\n');

    expect(
      headerLines.some(
        headerLine =>
          /offset/i.test(headerLine) &&
          headerLine.includes(String(DEFAULT_TIMING_SETTINGS.offsetNearZeroMs)),
      ),
    ).toBe(true);
    expect(
      headerLines.some(
        headerLine =>
          /ratio/i.test(headerLine) &&
          headerLine.includes(
            String(DEFAULT_TIMING_SETTINGS.fpsRatioNearOneDelta),
          ),
      ),
    ).toBe(true);
  });

  it('records the derived tier-4 threshold in the header (metrics §4.3)', () => {
    expect(
      readHeader()
        .split('\n')
        .some(headerLine => /τ/.test(headerLine) && headerLine.includes('0.9')),
    ).toBe(true);
    expect(readReportText()).toContain(
      'cross-class rule not testable on this corpus',
    );
  });

  it('states the known gap of the ready-made tables on episode and title points', () => {
    expect(
      findLines(/Vega/).filter(
        reportLine =>
          reportLine.includes('+2000') &&
          reportLine.includes('Lyra') &&
          reportLine.includes('+50'),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('prints the not-run and not-measurable lines (metrics §0, §4.1)', () => {
    expect(readReportText()).toContain('not run: 1/10 videos with fits');
    expect(readReportText()).toContain('tier 2: not measurable');
    expect(readReportText()).toContain(
      'This number describes the corpus, not the method.',
    );
  });

  it('leaves a 0/0 video out of a macro mean and says so (D16)', () => {
    const definedCounts = [
      ...readReportText().matchAll(/defined in (\d+) of (\d+)/g),
    ].map(([, definedVideoCount, videoCount]) => ({
      definedVideoCount: Number(definedVideoCount),
      videoCount: Number(videoCount),
    }));

    expect(definedCounts.length).toBeGreaterThan(0);
    expect(
      definedCounts.some(
        ({definedVideoCount, videoCount}) => definedVideoCount < videoCount,
      ),
    ).toBe(true);
  });

  it('labels every time-family interval with its defined and total video counts', () => {
    const timeFamilyLines = findLines(/^- T[12] /).filter(reportLine =>
      reportLine.includes('interval'),
    );

    expect(timeFamilyLines).toHaveLength(2);
    expect(readReportText()).not.toContain('undefined');
    for (const timeFamilyLine of timeFamilyLines) {
      expect(
        [...timeFamilyLine.matchAll(/interval [^;]*\(n (\d+) of (\d+)\)/g)]
          .length,
      ).toBeGreaterThan(0);
      expect(timeFamilyLine).not.toMatch(/\(n \d+ of (?!2\))/);
    }
  });

  it('reports dedup, time family and the win/tie matrices', () => {
    for (const sectionName of ['D1', 'D2', 'D3', 'T1', 'T2']) {
      expect(readReportText()).toContain(sectionName);
    }
    expect(readReportText()).toMatch(/held-out/i);
    expect(readReportText()).toMatch(/win\/tie/i);
  });
});

describe('score-tables arguments', () => {
  it('reads the command with its report date', () => {
    expect(
      parseEvalArgs([
        'score-tables',
        '--atlas',
        '/data/atlas',
        '--report-date',
        REPORT_DATE,
      ]),
    ).toEqual({
      command: 'score-tables',
      atlasRoot: '/data/atlas',
      commandOptions: {'report-date': REPORT_DATE},
    });
    expect(EVAL_COMMANDS['score-tables']?.run).toBe(runScoreTablesCommand);
  });

  it('requires the report date', () => {
    expect(() =>
      parseEvalArgs(['score-tables', '--atlas', '/data/atlas']),
    ).toThrow('--report-date is required.');
  });

  it('takes no tier-4 threshold from the command line (metrics §4.3)', () => {
    const commandArgs = [
      'score-tables',
      '--atlas',
      '/data/atlas',
      '--report-date',
      REPORT_DATE,
    ];

    expect(() => parseEvalArgs(commandArgs)).not.toThrow();
    expect(() =>
      parseEvalArgs([...commandArgs, '--near-duplicate-threshold', '0.95']),
    ).toThrow(EvalUsageError);
  });
});
