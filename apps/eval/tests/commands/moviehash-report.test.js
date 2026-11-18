import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {EvalUsageError, parseEvalArgs} from '../../src/cli-args.js';
import {runMoviehashReportCommand} from '../../src/commands/moviehash-report.js';
import {ReportPrivacyError} from '../../src/report/write-report.js';
import {ATLAS_FIXTURE_ROOT} from '../support/atlas-fixture.js';

const REPORT_DATE = '2026-11-18';
const REPORT_FILE_NAME = `${REPORT_DATE}-moviehash-enrichment.md`;
const IDENTITY_HASHES = [
  '0123456789abcdef',
  '1111222233334444',
  'fedcba9876543210',
];

const enrichmentCases = [
  {
    caseCode: 'V90',
    searchedLanguageCodes: ['tur', 'eng'],
    hitCount: 7,
    hashMatchCount: 1,
    hashMatchSiteFileIds: ['70017001'],
  },
  {
    caseCode: 'V92',
    searchedLanguageCodes: ['tur', 'eng'],
    hitCount: 3,
    hashMatchCount: 0,
    hashMatchSiteFileIds: [],
  },
];

let workRoot;

beforeEach(async () => {
  workRoot = await mkdtemp(join(tmpdir(), 'moviehash-report-'));
});

afterEach(async () => {
  await rm(workRoot, {recursive: true, force: true});
});

const runReport = async enrichmentRows => {
  const enrichmentPath = join(workRoot, 'moviehash-enrichment.json');
  await writeFile(enrichmentPath, JSON.stringify(enrichmentRows), 'utf8');
  const reportsDir = join(workRoot, 'reports');
  const writtenLines = [];
  const reportPath = await runMoviehashReportCommand({
    atlasRoot: ATLAS_FIXTURE_ROOT,
    commandOptions: {enrichment: enrichmentPath, 'report-date': REPORT_DATE},
    writeLine: line => writtenLines.push(line),
    reportsDir,
  });
  return {reportsDir, reportPath, writtenLines};
};

const readTableCells = (reportText, caseCode) =>
  reportText
    .split('\n')
    .find(line => line.startsWith(`| ${caseCode} |`))
    ?.split('|')
    .map(cell => cell.trim())
    .filter(Boolean);

describe('runMoviehashReportCommand', () => {
  it('writes one table row of counts per case', async () => {
    const {reportsDir} = await runReport(enrichmentCases);
    const reportText = await readFile(
      join(reportsDir, REPORT_FILE_NAME),
      'utf8',
    );
    expect(readTableCells(reportText, 'V90')).toEqual(
      expect.arrayContaining(['V90', '7', '1']),
    );
    expect(readTableCells(reportText, 'V92')).toEqual(
      expect.arrayContaining(['V92', '3', '0']),
    );
  });

  it('prints the report path', async () => {
    const {reportPath, writtenLines} = await runReport(enrichmentCases);
    expect(reportPath).toBe(join(workRoot, 'reports', REPORT_FILE_NAME));
    expect(writtenLines).toEqual([`report: ${reportPath}`]);
  });

  it('names no site file id, hash, url or token', async () => {
    const {reportsDir} = await runReport(enrichmentCases);
    const reportText = await readFile(
      join(reportsDir, REPORT_FILE_NAME),
      'utf8',
    );
    for (const leakedFragment of [
      '70017001',
      ...IDENTITY_HASHES,
      '://',
      'auth=',
    ]) {
      expect(reportText.includes(leakedFragment)).toBe(false);
    }
  });

  it.each(IDENTITY_HASHES)(
    'refuses a report that would name the identity hash %s',
    async identityHash => {
      const reportRun = runReport([
        {...enrichmentCases[1], caseCode: identityHash},
      ]);
      await expect(reportRun).rejects.toThrow(ReportPrivacyError);
      await expect(
        readFile(join(workRoot, 'reports', REPORT_FILE_NAME)),
      ).rejects.toThrow();
    },
  );

  it('refuses a report that would name the twin identity file name', async () => {
    const reportRun = runReport([
      {
        ...enrichmentCases[1],
        caseCode: 'Fixture.Show.S01E01.720p.TWIN.mkv',
      },
    ]);
    await expect(reportRun).rejects.toThrow(ReportPrivacyError);
  });

  it('names the hit count as a first-page count', async () => {
    const {reportsDir} = await runReport(enrichmentCases);
    const reportText = await readFile(
      join(reportsDir, REPORT_FILE_NAME),
      'utf8',
    );
    expect(reportText).toContain('| Hits (first page) |');
  });
});

describe('moviehash-report arguments', () => {
  const baseArgs = ['moviehash-report', '--atlas', '/data/atlas'];

  it('reads an absolute enrichment path and a report date', () => {
    expect(
      parseEvalArgs([
        ...baseArgs,
        '--enrichment',
        '/data/moviehash-enrichment.json',
        '--report-date',
        REPORT_DATE,
      ]),
    ).toEqual({
      command: 'moviehash-report',
      atlasRoot: '/data/atlas',
      commandOptions: {
        enrichment: '/data/moviehash-enrichment.json',
        'report-date': REPORT_DATE,
      },
    });
  });

  it('rejects a relative enrichment path', () => {
    expect(() =>
      parseEvalArgs([
        ...baseArgs,
        '--enrichment',
        'moviehash-enrichment.json',
        '--report-date',
        REPORT_DATE,
      ]),
    ).toThrow(new EvalUsageError('--enrichment must be an absolute path.'));
  });

  it('rejects a missing enrichment path', () => {
    expect(() =>
      parseEvalArgs([...baseArgs, '--report-date', REPORT_DATE]),
    ).toThrow(new EvalUsageError('--enrichment is required.'));
  });
});
