import {readReportPrivateValues} from '../corpus/private-values.js';
import {REPORTS_DIR} from '../eval-paths.js';
import {
  readReferenceCommits,
  resolveReferenceRoot,
} from '../parser-test/datasets/external-names.js';
import {buildParserReport} from '../parser-test/parser-report.js';
import {runParserTest} from '../parser-test/run-parser-test.js';
import {readRunFingerprint} from '../report/fingerprint.js';
import {writeReport} from '../report/write-report.js';

const REPORT_NAME = 'name-parser';

export const writeParserReport = async ({
  atlasRoot,
  reportsDir,
  reportDate,
  markdown,
}) =>
  writeReport({
    reportsDir,
    reportDate,
    reportName: REPORT_NAME,
    markdown,
    privateValues: await readReportPrivateValues({atlasRoot}),
  });

export const runParserTestCommand = async ({
  atlasRoot,
  commandOptions,
  writeLine,
  referenceRoot = resolveReferenceRoot(),
  reportsDir = REPORTS_DIR,
}) => {
  const reportDate = commandOptions['report-date'];
  const [outcome, runFingerprint] = await Promise.all([
    runParserTest({
      atlasRoot,
      parserLabelsPath: commandOptions['parser-labels'],
      guessitOutputPath: commandOptions['guessit-output'],
      referenceRoot,
      referenceCommits: readReferenceCommits({referenceRoot}),
    }),
    readRunFingerprint(atlasRoot),
  ]);
  const reportPath = await writeParserReport({
    atlasRoot,
    reportsDir,
    reportDate,
    markdown: buildParserReport({outcome, reportDate, runFingerprint}),
  });
  writeLine(`report: ${reportPath}`);
  writeLine(outcome.decision.decisionLine);
  return reportPath;
};
