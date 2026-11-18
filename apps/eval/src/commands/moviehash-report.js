import {sumBy} from 'es-toolkit';
import {atlasPaths} from '../corpus/atlas-paths.js';
import {REPORTS_DIR} from '../eval-paths.js';
import {readJsonFile} from '../json-file.js';
import {formatTableRow, formatTableRule} from '../report/format-cells.js';
import {writeReport} from '../report/write-report.js';

const REPORT_NAME = 'moviehash-enrichment';
const TABLE_HEADER = ['Case', 'Languages', 'Hits (first page)', 'Hash matches'];

const readIdentityPrivateValues = async atlasRoot => {
  const identities = await readJsonFile(atlasPaths.identities(atlasRoot));
  return Object.values(identities.videos)
    .flatMap(videoIdentity => [videoIdentity.osHash, videoIdentity.fileName])
    .filter(Boolean);
};

const buildMoviehashReport = ({reportDate, enrichmentCases}) => {
  const matchedCaseCount = enrichmentCases.filter(
    enrichmentCase => enrichmentCase.hashMatchCount > 0,
  ).length;
  const hitTotal = sumBy(enrichmentCases, ({hitCount}) => hitCount);
  const hashMatchTotal = sumBy(
    enrichmentCases,
    ({hashMatchCount}) => hashMatchCount,
  );
  return [
    `# Moviehash enrichment — ${reportDate}`,
    '',
    `Hashed cases searched: ${enrichmentCases.length}.`,
    `Cases with a hash match: ${matchedCaseCount}.`,
    `Hits: ${hitTotal}; hash matches: ${hashMatchTotal}.`,
    'Each hit count covers the first result page of one search, not a site total.',
    '',
    'No ranking run uses these counts (metrics v1 §1.1a).',
    '',
    formatTableRow(TABLE_HEADER),
    formatTableRule(TABLE_HEADER.length),
    ...enrichmentCases.map(enrichmentCase =>
      formatTableRow([
        enrichmentCase.caseCode,
        enrichmentCase.searchedLanguageCodes.join(', '),
        enrichmentCase.hitCount,
        enrichmentCase.hashMatchCount,
      ]),
    ),
    '',
  ].join('\n');
};

export const runMoviehashReportCommand = async ({
  atlasRoot,
  commandOptions,
  writeLine,
  reportsDir = REPORTS_DIR,
}) => {
  const reportDate = commandOptions['report-date'];
  const [enrichmentCases, privateValues] = await Promise.all([
    readJsonFile(commandOptions.enrichment),
    readIdentityPrivateValues(atlasRoot),
  ]);
  const reportPath = await writeReport({
    reportsDir,
    reportDate,
    reportName: REPORT_NAME,
    markdown: buildMoviehashReport({reportDate, enrichmentCases}),
    privateValues,
  });
  writeLine(`report: ${reportPath}`);
  return reportPath;
};
