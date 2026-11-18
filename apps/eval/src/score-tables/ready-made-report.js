import {AIOSUBTITLES_SCORE_TABLE} from '@repo/subtitle-core/scoring/aiosubtitles-score-table.js';
import {
  CUE_SHAPE_MAX_END_SHARE,
  CUE_SHAPE_MIN_CUES_PER_MINUTE,
  CUE_SHAPE_MIN_END_SHARE,
} from '@repo/subtitle-core/scoring/extract-signals.js';
import {READY_MADE_SCORE_TABLES} from '@repo/subtitle-core/scoring/ready-made-score-tables.js';
import {
  COMPARISON_METHOD_VERSION,
  DEFAULT_TIMING_SETTINGS,
} from '@repo/subtitle-core/timing/compare-cue-timings.js';
import {ExpectedClass} from '../constants/expected-class.js';
import {RankingLabel} from '../constants/ranking-label.js';
import {rankGroupsByServedOrder} from '../commands/rank-groups.js';
import {NEAR_DUPLICATE_THRESHOLD_BASE} from '../metrics/dedup-metrics.js';
import {isInformativeVideo} from '../metrics/ranking-metrics.js';
import {RESAMPLE_DRAW_COUNT, RESAMPLE_SEED} from '../metrics/resampling.js';
import {
  MISSING_CELL,
  formatScore,
  formatSpread,
  formatTableRow,
  formatTableRule,
} from '../report/format-cells.js';
import {RANKING_METRIC_TITLES} from './ranking-run.js';
import {
  FAMILY_AGREEMENT_FIELDS,
  TRUTH_AGREEMENT_FIELDS,
} from './time-family-run.js';

const WEIGHT_LEARNING_VIDEO_MIN = 10;

const METRICS_VIDEO_SETS = {
  Y1: ['V06', 'V08', 'V15'],
  Y2: ['V04', 'V06', 'V08', 'V15', 'V19', 'V41'],
};

const FIELD_TITLES = {
  precision: 'precision',
  recall: 'recall',
  balancedAccuracy: 'balanced accuracy',
};

const D1_CORPUS_NOTE =
  'D1 recall is expected near 0: every valid pool row has a distinct site id, because Orion already merged same-id rows. This number describes the corpus, not the method.';

const KNOWN_GAP_LINE =
  '- Known gap: the ready-made tables lose their "name states the requested episode or title" match points (Vega +2000, Lyra +50). No signal carries them, so those tables cannot reward a name that states the right episode or title.';

const NO_CROSS_CLASS_LINE = 'cross-class rule not testable on this corpus';

const formatCodes = videoCodes =>
  videoCodes.length === 0 ? 'none' : videoCodes.join(', ');

const formatSpreadCell = (spread, videoCount) =>
  spread === null
    ? `${MISSING_CELL} (n 0 of ${videoCount})`
    : `${formatSpread(spread)} (n ${spread.unitCount} of ${videoCount})`;

const formatDefinedMean = ({value, definedVideoCount, videoCount}) =>
  `${formatScore(value)} (defined in ${definedVideoCount} of ${videoCount})`;

const formatRecall = ({mergedPairCount, pairCount, recall}) =>
  `${formatScore(recall)} (${mergedPairCount}/${pairCount})`;

const readLabelSummary = (rowSummary, label) =>
  rowSummary.labelSummaries.find(labelSummary => labelSummary.label === label);

const countClassGroups = (groups, classes) =>
  groups.filter(group => classes.includes(group.groupClass)).length;

const describeVideo = ({videoCode, evalCase, groups}) => {
  const rankedGroups = rankGroupsByServedOrder({groups});
  const validGroups = groups.filter(group => group.isValid);
  const labelCounts = RankingLabel.values.map(label => {
    const {positiveClasses, negativeClasses} = RankingLabel.item(label);
    return {
      label,
      positiveCount: countClassGroups(validGroups, positiveClasses),
      negativeCount: countClassGroups(validGroups, negativeClasses),
      isInformative: isInformativeVideo({rankedGroups, label}),
    };
  });
  return {
    videoCode,
    auditStatus: evalCase.truthAuditStatus,
    groupCount: validGroups.length,
    hasFits: countClassGroups(validGroups, [ExpectedClass.FITS]) > 0,
    invalidRowCount: groups.length - validGroups.length,
    labelCounts,
  };
};

const buildHeader = ({
  reportDate,
  runFingerprint,
  nearDuplicateCheck,
  timeFamily,
}) => {
  const {corpusFingerprint, codeFingerprint} = runFingerprint;
  const {finalSetting, finalCriterion} = timeFamily;
  return [
    `# Ready-made scoring tables (${reportDate})`,
    '',
    `- Metrics: v1. Metrics SHA-256: ${corpusFingerprint.metricsSha256}`,
    `- Corpus index SHA-256: ${corpusFingerprint.indexSha256}`,
    `- Case SHA-256: ${Object.entries(corpusFingerprint.caseSha256ByCode)
      .map(([caseCode, caseSha256]) => `${caseCode} ${caseSha256}`)
      .join(', ')}`,
    `- Code: eval source tree ${codeFingerprint.evalSourceTree}, subtitle-core source tree ${codeFingerprint.subtitleCoreSourceTree}`,
    `- Uncommitted source changes: ${codeFingerprint.hasUncommittedChanges ? 'yes' : 'no'}`,
    `- Tables: ${[AIOSUBTITLES_SCORE_TABLE, ...READY_MADE_SCORE_TABLES]
      .map(({tableName}) => tableName)
      .join(
        ', ',
      )}; baseline: Orion served order, score = −(1-based list position).`,
    '- Scorer input: the video file name and the catalog id only. No video hash, fps or runtime (metrics §1.1a).',
    '- Primary run: list-time signals only. File validity, the reference time family and the catalog runtime stay unknown for every table (metrics §6). Invalid rows are ranked with file validity unknown and counted on their own line (§2.6).',
    `- Secondary run (${AIOSUBTITLES_SCORE_TABLE.tableName} only): adds the copy count across sites, from the product duplicate groups at τ, and the line count against the video duration from the candidates data (unknown without a record). File validity still never acts.`,
    `- Secondary copy count and labels: τ is derived from cross-class similarity (metrics §4.3), so the copy count is free of labels only while τ = τ₀ (${nearDuplicateCheck.threshold === NEAR_DUPLICATE_THRESHOLD_BASE ? 'true on this run' : 'not true on this run'}).`,
    `- Signal and parser versions: carried by the subtitle-core source tree hash above (signal extractor, score tables and the parsium-media name parser it pins); timing comparison method v${COMPARISON_METHOD_VERSION}.`,
    `- Line count against duration (cue-shape) limits, placeholders not yet tuned: last cue end ${CUE_SHAPE_MIN_END_SHARE}–${CUE_SHAPE_MAX_END_SHARE} × duration, at least ${CUE_SHAPE_MIN_CUES_PER_MINUTE} cue per minute.`,
    `- Time-family limits, fixed before the run (metrics §5.3): near-zero offset ≤ ${DEFAULT_TIMING_SETTINGS.offsetNearZeroMs} ms; near-one ratio |ratio − 1| ≤ ${DEFAULT_TIMING_SETTINGS.fpsRatioNearOneDelta}.`,
    `- Time-family setting chosen on all videos: start tolerance ${finalSetting.startToleranceMs} ms, matched share ≥ ${finalSetting.matchedShareMin} (T1 balanced accuracy ${formatScore(finalCriterion)}).`,
    `- Tier-4 threshold τ = ${nearDuplicateCheck.threshold} (τ₀ ${NEAR_DUPLICATE_THRESHOLD_BASE}; highest cross-class similarity ${formatScore(nearDuplicateCheck.crossClassSimilarityMax)}).`,
    `- Resampling: videos sorted by code, exact enumeration when n ≤ 7, otherwise ${RESAMPLE_DRAW_COUNT} resamples with mulberry32 seed ${RESAMPLE_SEED}.`,
    KNOWN_GAP_LINE,
    '',
  ];
};

const buildVideoSection = videoDescriptions => [
  '## Videos',
  '',
  formatTableRow([
    'Video',
    'Audit',
    'Groups',
    'Invalid rows',
    ...RankingLabel.values.flatMap(label => [
      `${label} + / −`,
      `${label} informative`,
    ]),
  ]),
  formatTableRule(4 + RankingLabel.values.length * 2),
  ...videoDescriptions.map(videoDescription =>
    formatTableRow([
      videoDescription.videoCode,
      videoDescription.auditStatus,
      videoDescription.groupCount,
      videoDescription.invalidRowCount,
      ...videoDescription.labelCounts.flatMap(labelCount => [
        `${labelCount.positiveCount} / ${labelCount.negativeCount}`,
        labelCount.isInformative ? 'yes' : 'no',
      ]),
    ]),
  ),
  '',
  ...RankingLabel.values.map(label => {
    const informativeCodes = videoDescriptions
      .filter(
        videoDescription =>
          videoDescription.labelCounts.find(
            labelCount => labelCount.label === label,
          ).isInformative,
      )
      .map(({videoCode}) => videoCode);
    const listedCodes = METRICS_VIDEO_SETS[label];
    const isSame = informativeCodes.join() === listedCodes.join();
    return `- ${label} informative videos: ${formatCodes(informativeCodes)}${isSame ? ' (as metrics §1.4 lists)' : `; metrics §1.4 lists ${formatCodes(listedCodes)}`}.`;
  }),
  `- Learned table: not run: ${videoDescriptions.filter(({hasFits}) => hasFits).length}/${WEIGHT_LEARNING_VIDEO_MIN} videos with fits.`,
  '',
];

const formatMetricCell = (metric, isAuditPassedOnly) =>
  isAuditPassedOnly
    ? formatSpreadCell(metric.auditPassedSpread, metric.auditPassedVideoCount)
    : formatSpreadCell(metric.spread, metric.videoCount);

const buildRankingTable = ({
  rowSummaries,
  label,
  isAuditPassedOnly = false,
}) => [
  formatTableRow(['Table', ...RANKING_METRIC_TITLES]),
  formatTableRule(1 + RANKING_METRIC_TITLES.length),
  ...rowSummaries.map(rowSummary =>
    formatTableRow([
      rowSummary.rowName,
      ...readLabelSummary(rowSummary, label).metrics.map(metric =>
        formatMetricCell(metric, isAuditPassedOnly),
      ),
    ]),
  ),
  '',
];

const buildPerVideoTables = ({rowSummaries, label}) =>
  RANKING_METRIC_TITLES.flatMap((metricTitle, metricIndex) => {
    const readVideoValues = rowSummary =>
      readLabelSummary(rowSummary, label).metrics[metricIndex].videoValues;
    const videoCodes = readVideoValues(rowSummaries[0]).map(
      ({videoCode}) => videoCode,
    );
    return [
      `Per-video ${label}, ${metricTitle}:`,
      '',
      formatTableRow(['Table', ...videoCodes]),
      formatTableRule(1 + videoCodes.length),
      ...rowSummaries.map(rowSummary =>
        formatTableRow([
          rowSummary.rowName,
          ...readVideoValues(rowSummary).map(({metricValue}) =>
            formatScore(metricValue),
          ),
        ]),
      ),
      '',
    ];
  });

const buildRankingSection = ({groupView}) => {
  const rowSummaries = [
    ...groupView.primarySummaries,
    groupView.secondarySummary,
  ];
  return [
    '## Ranking (content groups)',
    '',
    'Each cell: macro mean [95% interval] (n videos where the metric is defined, of the informative videos); worst error is a sum over videos.',
    '',
    ...RankingLabel.values.flatMap(label => [
      `### ${label}`,
      '',
      ...buildRankingTable({rowSummaries, label}),
      ...buildPerVideoTables({rowSummaries, label}),
      ...rowSummaries.map(rowSummary => {
        const labelSummary = readLabelSummary(rowSummary, label);
        return `- ${rowSummary.rowName}: worst-error videos ${formatCodes(labelSummary.worstErrorVideoCodes)}; dropped positives ${labelSummary.droppedPositives.droppedCount} (${formatCodes(labelSummary.droppedPositives.videoCodes)}); invalid rows above the best positive ${labelSummary.invalidAbove.invalidAboveCount} (${formatCodes(labelSummary.invalidAbove.videoCodes)}).`;
      }),
      '',
    ]),
  ];
};

const buildComparisonSection = ({comparisons, groupView}) => {
  const rowNames = groupView.primarySummaries.map(({rowName}) => rowName);
  return [
    '## Win/tie matrices (pair order)',
    '',
    'A row beats a column only when the 95% interval of the paired difference is above 0. With 3 videos, the worst video drawn three times weighs 1/27 > 0.025, so a table wins only when it is better on every video and most comparisons are ties. The secondary run is not compared.',
    '',
    ...comparisons.flatMap(({label, outcomeRows, notBeatenRowNames}) => [
      `### ${label}`,
      '',
      formatTableRow(['Row vs column', ...rowNames]),
      formatTableRule(1 + rowNames.length),
      ...outcomeRows.map((outcomeRow, rowIndex) =>
        formatTableRow([
          rowNames[rowIndex],
          ...outcomeRow.map(outcome => outcome ?? MISSING_CELL),
        ]),
      ),
      '',
      `- Not beaten: ${notBeatenRowNames.join(', ')}.`,
      '',
    ]),
  ];
};

const buildSensitivitySection = ({groupView, rowView}) => [
  '## Passed-audit-only sensitivity (no decision)',
  '',
  ...RankingLabel.values.flatMap(label => [
    `### ${label}, videos whose truth audit passed`,
    '',
    ...buildRankingTable({
      rowSummaries: [...groupView.primarySummaries, groupView.secondarySummary],
      label,
      isAuditPassedOnly: true,
    }),
  ]),
  '## Row-level view (descriptive, no decision)',
  '',
  ...RankingLabel.values.flatMap(label => [
    `### ${label} rows`,
    '',
    ...buildRankingTable({
      rowSummaries: [...rowView.primarySummaries, rowView.secondarySummary],
      label,
    }),
  ]),
];

const buildDedupSection = ({
  tierOneRecall,
  contentKeyAgreement,
  nearDuplicateCheck,
  productGrouping,
}) => {
  const {pairRecall, rowReduction, falseMerges} = tierOneRecall;
  const {total, macro, videos} = contentKeyAgreement;
  const {thresholdCheck} = nearDuplicateCheck;
  return [
    '## Deduplication',
    '',
    '### D1: tier 1-2 recall without download',
    '',
    `- Pair recall: total ${formatRecall(pairRecall.total)}, same site ${formatRecall(pairRecall.sameSite)}, cross-site ${formatRecall(pairRecall.crossSite)}.`,
    `- Row reduction: ${formatScore(rowReduction)}.`,
    `- False merges: ${falseMerges.pairCount} (${formatCodes(falseMerges.videoCodes)}).`,
    '- tier 2: not measurable (the corpus has no alias data).',
    `- ${D1_CORPUS_NOTE}`,
    '',
    '### D2: tier-3 key agreement',
    '',
    `- Micro: precision ${formatScore(total.precision)}, recall ${formatScore(total.recall)} (${total.agreedPairCount} agreed, ${total.equalContentKeyPairCount} equal keys, ${total.sharedCandidateKeyPairCount} same content).`,
    `- Macro: precision ${formatDefinedMean(macro.precision)}, recall ${formatDefinedMean(macro.recall)}.`,
    `- Cross-class equal keys: ${total.crossClassPairCount}. Byte-identical pairs split: ${total.byteIdenticalSplitPairCount}.`,
    ...videos.map(
      video =>
        `- ${video.videoCode}: precision ${formatScore(video.precision)}, recall ${formatScore(video.recall)}, cross-class ${video.crossClassPairCount}, byte-identical split ${video.byteIdenticalSplitPairCount}.`,
    ),
    '',
    '### D3: tier-4 threshold rule',
    '',
    `- Time-equal group pairs: ${thresholdCheck.pairCount}; cross-class among them: ${thresholdCheck.crossClassPairCount}; highest cross-class similarity: ${formatScore(thresholdCheck.crossClassSimilarityMax)}; τ ${nearDuplicateCheck.threshold}.`,
    `- Merges at τ: cross-class ${thresholdCheck.crossClassMergeCount}, same-class ${thresholdCheck.sameClassMergeCount}.`,
    ...thresholdCheck.videos.map(
      video =>
        `- ${video.videoCode}: pairs ${video.pairCount}, cross-class ${video.crossClassPairCount}, cross-class merges ${video.crossClassMergeCount}, same-class merges ${video.sameClassMergeCount}.`,
    ),
    ...(thresholdCheck.crossClassPairCount === 0
      ? [`- ${NO_CROSS_CLASS_LINE}.`]
      : []),
    `- Product duplicate grouping at τ (tiers 1-4, per language): ${productGrouping.rowCount} rows in ${productGrouping.duplicateGroupCount} groups; the secondary run reads its copy count from these groups.`,
    `- Rows without a parsable site id: ${productGrouping.missingSiteIdRowCount}. Two such rows of one source would merge at tier 1 in the product grouping and raise the secondary copy count; D1 gives them no key.`,
    '',
  ];
};

const formatFields = (fields, fieldNames) =>
  fieldNames
    .map(
      fieldName =>
        `${FIELD_TITLES[fieldName]} ${formatDefinedMean(fields[fieldName])}, interval ${formatSpreadCell(fields[fieldName].spread, fields[fieldName].videoCount)}`,
    )
    .join('; ');

const buildTimeFamilySection = ({timeFamily}) => {
  const {familyAgreement, truthAgreement} = timeFamily;
  return [
    '## Time family (held-out values, leave one video out)',
    '',
    `- T1 against Atlas time families: ${formatFields(familyAgreement.fields, FAMILY_AGREEMENT_FIELDS)}.`,
    `- T1 predicted-same cross-class pairs: ${familyAgreement.crossClassSameCount} in all; per video: ${familyAgreement.videos
      .map(
        ({videoCode, crossClassSameCount}) =>
          `${videoCode} ${crossClassSameCount}`,
      )
      .join(', ')}.`,
    `- T2 with the truth track as reference: ${formatFields(truthAgreement.fields, TRUTH_AGREEMENT_FIELDS)}.`,
    '- T1 measures agreement with Atlas’s own grouping rule, not an independent truth.',
    '',
  ];
};

const buildNotRunSection = ({videoDescriptions, nearDuplicateCheck}) => [
  '## Not run and not measurable',
  '',
  `- Learned table: not run: ${videoDescriptions.filter(({hasFits}) => hasFits).length}/${WEIGHT_LEARNING_VIDEO_MIN} videos with fits.`,
  '- tier 2: not measurable.',
  `- ${D1_CORPUS_NOTE}`,
  ...(nearDuplicateCheck.thresholdCheck.crossClassPairCount === 0
    ? [`- D3: ${NO_CROSS_CLASS_LINE}.`]
    : []),
  '',
];

export const buildReadyMadeReport = ({
  reportDate,
  runFingerprint,
  videos,
  groupView,
  rowView,
  comparisons,
  tierOneRecall,
  contentKeyAgreement,
  nearDuplicateCheck,
  productGrouping,
  timeFamily,
}) => {
  const videoDescriptions = videos.map(describeVideo);
  return [
    ...buildHeader({
      reportDate,
      runFingerprint,
      nearDuplicateCheck,
      timeFamily,
    }),
    ...buildVideoSection(videoDescriptions),
    ...buildRankingSection({groupView}),
    ...buildComparisonSection({comparisons, groupView}),
    ...buildSensitivitySection({groupView, rowView}),
    ...buildDedupSection({
      tierOneRecall,
      contentKeyAgreement,
      nearDuplicateCheck,
      productGrouping,
    }),
    ...buildTimeFamilySection({timeFamily}),
    ...buildNotRunSection({videoDescriptions, nearDuplicateCheck}),
  ].join('\n');
};
