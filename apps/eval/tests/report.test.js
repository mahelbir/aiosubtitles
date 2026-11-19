import {access, mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {redactReportText} from '../src/report/redact.js';
import {ReportPrivacyError, writeReport} from '../src/report/write-report.js';

const FINGERPRINT = 'c0ffee12'.repeat(8);

describe('redactReportText', () => {
  it('replaces each url and a bare auth token', () => {
    expect(
      redactReportText(
        'a https://pool.example/x?auth=T1 b auth=T2 c http://h/p d',
      ),
    ).toBe('a <url> b auth=<redacted> c <url> d');
  });

  it('replaces an Orion url whose path holds the token', () => {
    expect(
      redactReportText(
        'row https://h/languages=tr&auth=SECRET123/adb/tr/1-2-3.srt end',
      ),
    ).toBe('row <url> end');
  });

  it('keeps the bars of a markdown table cell around a url', () => {
    expect(redactReportText('|V06|https://h/a?auth=T1|0.8|auth=T2|')).toBe(
      '|V06|<url>|0.8|auth=<redacted>|',
    );
  });

  it('keeps the brackets of a markdown link around a url', () => {
    expect(redactReportText('[row](https://h/a/b.srt) and <https://h/c>')).toBe(
      '[row](<url>) and <<url>>',
    );
  });

  it('leaves text without a url or token unchanged', () => {
    expect(redactReportText('| V06 | 0.82 | auth is fine |')).toBe(
      '| V06 | 0.82 | auth is fine |',
    );
  });
});

describe('writeReport', () => {
  let tmp;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'eval-report-'));
  });

  afterEach(async () => {
    await rm(tmp, {recursive: true, force: true});
  });

  it('never writes a URL or auth token into a report', async () => {
    const markdown =
      'row https://h/languages=tr&auth=SECRET123/adb/tr/1-2-3.srt end';
    const reportPath = await writeReport({
      reportsDir: tmp,
      reportDate: '2026-11-17',
      reportName: 't',
      markdown,
      privateValues: [],
    });
    const written = await readFile(reportPath, 'utf8');
    expect(written).not.toContain('SECRET123');
    expect(written).not.toMatch(/https?:\/\//);
  });

  it('refuses a report that names a private value', async () => {
    await expect(
      writeReport({
        reportsDir: tmp,
        reportDate: '2026-11-17',
        reportName: 't',
        markdown: 'video Private.Show.S01E01.mkv',
        privateValues: ['Private.Show.S01E01.mkv'],
      }),
    ).rejects.toThrow(ReportPrivacyError);
  });

  it('writes the redacted text to the dated report path', async () => {
    const reportPath = await writeReport({
      reportsDir: tmp,
      reportDate: '2026-11-17',
      reportName: 'ranking',
      markdown: '# Ranking\n\nrow https://h/x end\n',
      privateValues: [],
    });
    expect(reportPath).toBe(join(tmp, '2026-11-17-ranking.md'));
    expect(await readFile(reportPath, 'utf8')).toContain('row <url> end');
  });

  it('keeps the corpus and metrics fingerprints in the header', async () => {
    const reportPath = await writeReport({
      reportsDir: tmp,
      reportDate: '2026-11-17',
      reportName: 'header',
      markdown: `metrics sha256 ${FINGERPRINT}\n`,
      privateValues: ['0123456789abcdef'],
    });
    expect(await readFile(reportPath, 'utf8')).toContain(FINGERPRINT);
  });

  it('writes no file when it refuses a report', async () => {
    const reportPath = join(tmp, '2026-11-17-refused.md');
    await expect(
      writeReport({
        reportsDir: tmp,
        reportDate: '2026-11-17',
        reportName: 'refused',
        markdown: 'hash 0123456789abcdef',
        privateValues: ['0123456789abcdef'],
      }),
    ).rejects.toBeInstanceOf(ReportPrivacyError);
    await expect(access(reportPath)).rejects.toThrow();
  });

  it('refuses an auth token that survives redaction', async () => {
    await expect(
      writeReport({
        reportsDir: tmp,
        reportDate: '2026-11-17',
        reportName: 'spaced',
        markdown: 'token auth= SECRET123',
        privateValues: [],
      }),
    ).rejects.toBeInstanceOf(ReportPrivacyError);
  });

  it('matches a private value whatever its letter case', async () => {
    await expect(
      writeReport({
        reportsDir: tmp,
        reportDate: '2026-11-17',
        reportName: 'cased',
        markdown: 'hash 0123456789ABCDEF',
        privateValues: ['0123456789abcdef'],
      }),
    ).rejects.toBeInstanceOf(ReportPrivacyError);
  });

  it('ignores an empty private value', async () => {
    const reportPath = await writeReport({
      reportsDir: tmp,
      reportDate: '2026-11-17',
      reportName: 'empty-private',
      markdown: 'aggregate 0.5',
      privateValues: [''],
    });
    expect(await readFile(reportPath, 'utf8')).toBe('aggregate 0.5');
  });

  it('allows a one-word title equal to a class word', async () => {
    const reportPath = await writeReport({
      reportsDir: tmp,
      reportDate: '2026-11-17',
      reportName: 'class-word',
      markdown: 'classes: Drift 2, wrong 4',
      privateValues: ['Drift'],
    });
    expect(await readFile(reportPath, 'utf8')).toBe(
      'classes: Drift 2, wrong 4',
    );
  });

  it('refuses a multi-token release name inside a sentence whatever its case', async () => {
    await expect(
      writeReport({
        reportsDir: tmp,
        reportDate: '2026-11-17',
        reportName: 'release-name',
        markdown: 'the top row was fixture show s01e01 web, sadly.',
        privateValues: ['Fixture Show S01E01 WEB'],
      }),
    ).rejects.toBeInstanceOf(ReportPrivacyError);
  });

  it('allows a private value that only sits inside a longer word', async () => {
    const reportPath = await writeReport({
      reportsDir: tmp,
      reportDate: '2026-11-17',
      reportName: 'longer-word',
      markdown: 'row BigShow.S01E01 kept',
      privateValues: ['Show.S01'],
    });
    expect(await readFile(reportPath, 'utf8')).toBe('row BigShow.S01E01 kept');
  });

  it('refuses a one-token identifier such as a token value', async () => {
    await expect(
      writeReport({
        reportsDir: tmp,
        reportDate: '2026-11-17',
        reportName: 'identifier',
        markdown: 'leaked SECRET123 here',
        privateValues: ['secret123'],
      }),
    ).rejects.toBeInstanceOf(ReportPrivacyError);
  });

  it.each([
    ['a report date that is not YYYY-MM-DD', '17-11-2026', 'ranking'],
    ['a report name with a path separator', '2026-11-17', '../ranking'],
  ])('rejects %s', async (_label, reportDate, reportName) => {
    await expect(
      writeReport({
        reportsDir: tmp,
        reportDate,
        reportName,
        markdown: 'aggregate',
        privateValues: [],
      }),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it('gives privacy errors a name', () => {
    expect(new ReportPrivacyError('x').name).toBe('ReportPrivacyError');
  });
});
