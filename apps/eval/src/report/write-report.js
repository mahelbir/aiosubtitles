import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {redactReportText} from './redact.js';

const REPORT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const REPORT_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LEFTOVER_AUTH_PATTERN = /auth=[^<]/i;
const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;
const LONE_IDENTIFIER_PATTERN = /^(?=.*\p{N})[\p{L}\p{N}]{8,}$/u;

const isCheckedPrivateValue = privateValue => {
  const tokens = privateValue.match(TOKEN_PATTERN) ?? [];
  return (
    tokens.length > 1 ||
    (tokens.length === 1 && LONE_IDENTIFIER_PATTERN.test(tokens[0]))
  );
};

export class ReportPrivacyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReportPrivacyError';
  }
}

const assertReportPrivacy = (reportText, privateValues) => {
  if (LEFTOVER_AUTH_PATTERN.test(reportText)) {
    throw new ReportPrivacyError('A report still holds an auth token.');
  }
  const hasPrivateValue = privateValues
    .filter(isCheckedPrivateValue)
    .some(privateValue =>
      new RegExp(
        `(?<![\\p{L}\\p{N}])${RegExp.escape(privateValue)}(?![\\p{L}\\p{N}])`,
        'iu',
      ).test(reportText),
    );
  if (hasPrivateValue) {
    throw new ReportPrivacyError('A report names a private value.');
  }
};

export const writeReport = async ({
  reportsDir,
  reportDate,
  reportName,
  markdown,
  privateValues,
}) => {
  if (!REPORT_DATE_PATTERN.test(reportDate)) {
    throw new RangeError('A report date must be YYYY-MM-DD.');
  }
  if (!REPORT_NAME_PATTERN.test(reportName)) {
    throw new RangeError('A report name must be kebab-case.');
  }
  const reportText = redactReportText(markdown);
  assertReportPrivacy(reportText, privateValues);
  const reportPath = join(reportsDir, `${reportDate}-${reportName}.md`);
  await mkdir(reportsDir, {recursive: true});
  await writeFile(reportPath, reportText, 'utf8');
  return reportPath;
};
