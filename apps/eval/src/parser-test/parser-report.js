import {NameDataset, ParserLibrary} from '../constants/parser-library.js';
import {RESAMPLE_DRAW_COUNT, RESAMPLE_SEED} from '../metrics/resampling.js';
import {PARSED_FIELD_NAMES} from './normalize-fields.js';

const SCORE_DIGITS = 3;
const PERCENT_SCALE = 100;
const PERCENT_DIGITS = 1;
const MISSING_CELL = '—';

const FIELD_HEADERS = {
  releaseGroup: 'group',
  releaseSourceFamily: 'source',
  streamingService: 'service',
  releaseEdition: 'edition',
  seasonNumbers: 'season',
  episodeNumbers: 'episode',
  releaseTitle: 'title',
  releaseYear: 'year',
};

export const VIDEO_FILENAME_PARSER_MODE_RULE =
  'TV mode when its TV reading finds a season, unless that season and episode spell the movie reading’s year; movie mode otherwise.';

const VIDEO_FILENAME_PARSER_SERVICE_NOTE =
  'the library has no service field, so its service reading is always absent and it is right on own names only where no service is labelled; it also infers WEBDL for some names without a source token.';

const SONARR_TITLE_NOTE =
  'some Sonarr title items keep the series year (“Series Title 2010”); every library that splits the year out of the title loses those items alike, so paired differences are unchanged.';

const formatExternalCounts = countByDataset =>
  NameDataset.values
    .filter(datasetName => datasetName !== NameDataset.OWN)
    .map(
      datasetName =>
        `${NameDataset.label(datasetName)} ${countByDataset[datasetName]}`,
    )
    .join(', ');

const formatScore = scoreValue =>
  scoreValue === null ? MISSING_CELL : scoreValue.toFixed(SCORE_DIGITS);

const formatSpread = ({pointEstimate, lowerBound, upperBound}) =>
  `${formatScore(pointEstimate)} [${formatScore(lowerBound)}, ${formatScore(upperBound)}]`;

const formatRate = (numerator, denominator) =>
  denominator === 0
    ? MISSING_CELL
    : `${((numerator / denominator) * PERCENT_SCALE).toFixed(PERCENT_DIGITS)}%`;

const formatFieldCell = ({correctCount, itemCount, accuracy}) =>
  itemCount === 0
    ? MISSING_CELL
    : `${formatScore(accuracy)} (${correctCount}/${itemCount})`;

const formatTableRow = cells => `| ${cells.join(' | ')} |`;

const formatDatasets = datasetNames =>
  datasetNames.map(datasetName => NameDataset.label(datasetName)).join(' + ');

const buildRunSection = ({outcome, reportDate, runFingerprint}) => [
  `# Name-parser test (${reportDate})`,
  '',
  '## Run',
  '',
  `- Metrics: v1. Metrics SHA-256: ${runFingerprint.corpusFingerprint.metricsSha256}`,
  `- Corpus index SHA-256: ${runFingerprint.corpusFingerprint.indexSha256}`,
  `- Case SHA-256: ${Object.entries(
    runFingerprint.corpusFingerprint.caseSha256ByCode,
  )
    .map(([caseCode, caseSha256]) => `${caseCode} ${caseSha256}`)
    .join(', ')}`,
  `- Code: eval source tree ${runFingerprint.codeFingerprint.evalSourceTree}, subtitle-core source tree ${runFingerprint.codeFingerprint.subtitleCoreSourceTree}`,
  `- Uncommitted source changes: ${runFingerprint.codeFingerprint.hasUncommittedChanges ? 'yes' : 'no'}`,
  `- Parsers: guessit ${outcome.guessitVersion} (Python dump), ${Object.entries(
    outcome.libraryVersions,
  )
    .map(([packageName, version]) => `${packageName} ${version}`)
    .join(', ')}`,
  `- Reference commits: ${Object.entries(outcome.referenceCommits)
    .map(([projectName, commitHash]) => `${projectName} ${commitHash}`)
    .join(', ')}`,
  `- Labels SHA-256: ${outcome.labelsSha256}`,
  `- Own names: ${outcome.ownNameCount} in all; subtitle release names by the §7.2 rule: ${outcome.ownNameCountBySource.subtitleReleaseNames}; video file names: ${outcome.ownNameCountBySource.videoFilenames}`,
  `- External names: ${formatExternalCounts(outcome.nameCountByDataset)}`,
  `- Edition items dropped because one source names several canonical editions: ${formatExternalCounts(outcome.droppedEditionCountByDataset)}`,
  `- Resampling: names sorted by SHA-256, one unit per name in a comparison scope, ${RESAMPLE_DRAW_COUNT} resamples with mulberry32 seed ${RESAMPLE_SEED}, exact enumeration when n ≤ 7`,
  `- video-filename-parser mode: ${VIDEO_FILENAME_PARSER_MODE_RULE}`,
  `- video-filename-parser service: ${VIDEO_FILENAME_PARSER_SERVICE_NOTE}`,
  `- Sonarr titles: ${SONARR_TITLE_NOTE}`,
  '',
];

const buildSampleSection = ({ownTruth}) => [
  '## Agreed-sample check',
  '',
  `- Pending items labelled: ${ownTruth.pendingItemCount}`,
  `- Agreed items sampled: ${ownTruth.sampleSize}`,
  `- Sampled labels that differ from the agreed value: ${ownTruth.sampleErrorCount} (${formatRate(ownTruth.sampleErrorCount, ownTruth.sampleSize)})`,
  `- Labels outside the pending set, ignored: ${ownTruth.ignoredLabelCount}`,
  '',
];

const buildAccuracySection = ({libraryResults}) => [
  '## Per-field accuracy',
  '',
  ...NameDataset.values.flatMap(datasetName => {
    const datasetResults = libraryResults.filter(
      libraryResult => libraryResult.datasetName === datasetName,
    );
    const emptyFieldNames = datasetResults[0]?.emptyFieldNames ?? [];
    return [
      `### ${NameDataset.label(datasetName)}`,
      '',
      formatTableRow([
        'Library',
        ...PARSED_FIELD_NAMES.map(fieldName => FIELD_HEADERS[fieldName]),
        'Score [95% CI]',
        'n',
      ]),
      formatTableRow(
        Array.from({length: PARSED_FIELD_NAMES.length + 3}, () => '---'),
      ),
      ...datasetResults.map(libraryResult =>
        formatTableRow([
          ParserLibrary.label(libraryResult.library),
          ...PARSED_FIELD_NAMES.map(fieldName =>
            formatFieldCell(libraryResult.fieldAccuracy[fieldName]),
          ),
          formatSpread(libraryResult.libraryScore),
          libraryResult.libraryScore.unitCount,
        ]),
      ),
      '',
      `Fields without items: ${
        emptyFieldNames.length === 0
          ? 'none'
          : emptyFieldNames
              .map(fieldName => FIELD_HEADERS[fieldName])
              .join(', ')
      }.`,
      '',
    ];
  }),
];

const describeComparison = ({isAWinner, isBWinner, libraryA, libraryB}) => {
  if (isAWinner) {
    return `${ParserLibrary.label(libraryA)} wins`;
  }
  return isBWinner ? `${ParserLibrary.label(libraryB)} wins` : 'tie';
};

const buildComparisonSection = ({pairComparisons}) => [
  '## Pairwise comparisons',
  '',
  'A wins only when the 95% interval of the paired difference excludes 0.',
  '',
  formatTableRow(['A', 'B', 'Names', 'A − B [95% CI]', 'n', 'Result']),
  formatTableRow(Array.from({length: 6}, () => '---')),
  ...pairComparisons.map(pairComparison =>
    formatTableRow([
      ParserLibrary.label(pairComparison.libraryA),
      ParserLibrary.label(pairComparison.libraryB),
      formatDatasets(pairComparison.datasetNames),
      pairComparison.difference === null
        ? MISSING_CELL
        : formatSpread(pairComparison.difference),
      pairComparison.difference?.unitCount ?? 0,
      describeComparison(pairComparison),
    ]),
  ),
  '',
];

const buildDecisionSection = ({decision}) => [
  '## Decision',
  '',
  `- Own-name scores: ${Object.entries(decision.ownScoreByLibrary)
    .map(
      ([library, ownScore]) =>
        `${ParserLibrary.label(library)} ${formatScore(ownScore)}`,
    )
    .join(', ')}`,
  `- Best JS library: ${ParserLibrary.label(decision.bestLibrary)}. Carried forward: ${decision.carriedLibraries
    .map(library => ParserLibrary.label(library))
    .join(', ')}`,
  `- guessit ported: ${decision.isGuessitPorted ? 'yes' : 'no'}`,
  `- Season or episode losses of a port: ${
    decision.fieldFlags.length === 0
      ? 'none'
      : decision.fieldFlags
          .map(
            ({library, fieldName}) =>
              `${FIELD_HEADERS[fieldName]} to ${ParserLibrary.label(library)}`,
          )
          .join(', ')
  }`,
  '',
  decision.decisionLine,
  '',
];

export const buildParserReport = ({outcome, reportDate, runFingerprint}) =>
  [
    ...buildRunSection({outcome, reportDate, runFingerprint}),
    ...buildSampleSection(outcome),
    ...buildAccuracySection(outcome),
    ...buildComparisonSection(outcome),
    ...buildDecisionSection(outcome),
  ].join('\n');
