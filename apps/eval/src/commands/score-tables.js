import {identity, sortBy} from 'es-toolkit';
import {AIOSUBTITLES_SCORE_TABLE} from '@repo/subtitle-core/scoring/aiosubtitles-score-table.js';
import {RankingLabel} from '../constants/ranking-label.js';
import {createFrozenStore} from '../corpus/frozen-store.js';
import {readReportPrivateValues} from '../corpus/private-values.js';
import {readCorpus} from '../corpus/read-corpus.js';
import {REPORTS_DIR} from '../eval-paths.js';
import {readRunFingerprint} from '../report/fingerprint.js';
import {writeReport} from '../report/write-report.js';
import {
  runContentKeyAgreement,
  runNearDuplicateCheck,
  runProductGrouping,
  runTierOneRecall,
} from '../score-tables/dedup-run.js';
import {
  compareRankingRows,
  summarizeRankingRow,
} from '../score-tables/ranking-run.js';
import {buildReadyMadeReport} from '../score-tables/ready-made-report.js';
import {READY_MADE_SCORE_TABLES} from '../score-tables/ready-made-score-tables.js';
import {readGroupFileFacts} from '../score-tables/group-file-facts.js';
import {runTimeFamily} from '../score-tables/time-family-run.js';
import {
  buildEvalCandidates,
  buildEvalVideoContext,
} from './build-eval-candidates.js';
import {
  buildRankingGroups,
  rankGroupsByServedOrder,
  rankGroupsForTable,
  toListTimeCandidate,
} from './rank-groups.js';

const REPORT_NAME = 'ready-made-tables';
const PASSED_AUDIT_STATUS = 'passed';
const MS_PER_SECOND = 1000;

export const SERVED_ORDER_ROW_NAME = 'orion served order';
export const SECONDARY_ROW_NAME = `${AIOSUBTITLES_SCORE_TABLE.tableName} + post-download`;

const PRIMARY_SCORE_TABLES = [
  AIOSUBTITLES_SCORE_TABLE,
  ...READY_MADE_SCORE_TABLES,
];

const buildContentGroups = ({evalCase, candidates, videoContext}) => {
  const corpusCandidateById = new Map(
    evalCase.candidates.map(candidate => [candidate.candidateId, candidate]),
  );
  return buildRankingGroups({
    evalCase,
    candidates,
    video: videoContext,
    toRankingCandidate: identity,
  })
    .filter(group => group.isValid)
    .map(({groupClass, members}) => {
      const rows = members.map(({candidate}) => ({
        candidate,
        corpusCandidate: corpusCandidateById.get(candidate.urlCode),
      }));
      return {groupClass, timeFamily: rows[0].corpusCandidate.timeFamily, rows};
    });
};

const prepareVideo = async ({evalCase, frozenStore}) => {
  const candidates = await buildEvalCandidates({evalCase, frozenStore});
  const videoContext = buildEvalVideoContext(evalCase);
  return {
    videoCode: evalCase.caseCode,
    evalCase,
    candidates,
    videoContext,
    isAuditPassed: evalCase.truthAuditStatus === PASSED_AUDIT_STATUS,
    groups: buildRankingGroups({evalCase, candidates, video: videoContext}),
    contentGroups: buildContentGroups({evalCase, candidates, videoContext}),
  };
};

const splitIntoRows = groups =>
  groups.flatMap(({groupClass, isValid, members}) =>
    members.map(member => ({groupClass, isValid, members: [member]})),
  );

const readDurationMs = evalCase =>
  evalCase.video.durationSeconds == null
    ? null
    : evalCase.video.durationSeconds * MS_PER_SECOND;

export const buildPostDownloadGroups = ({video, copyCountByUrlCode}) =>
  buildRankingGroups({
    evalCase: video.evalCase,
    candidates: video.candidates,
    video: {
      ...video.videoContext,
      catalogDurationMs: readDurationMs(video.evalCase),
    },
    toRankingCandidate: candidate => ({
      ...toListTimeCandidate(candidate),
      fileFacts:
        candidate.fileFacts === null
          ? null
          : {...candidate.fileFacts, isFileValid: null},
      independentCopyCount: copyCountByUrlCode.get(candidate.urlCode),
    }),
  });

const buildRankingRows = ({videos, readGroups, copyCountByVideoCode}) => {
  const rankVideos = rankGroups =>
    videos.map(video => ({
      videoCode: video.videoCode,
      rankedGroups: rankGroups(readGroups(video)),
    }));
  return {
    primaryRows: [
      ...PRIMARY_SCORE_TABLES.map(scoreTable => ({
        rowName: scoreTable.tableName,
        videoRankings: rankVideos(groups =>
          rankGroupsForTable({groups, scoreTable}),
        ),
      })),
      {
        rowName: SERVED_ORDER_ROW_NAME,
        videoRankings: rankVideos(groups => rankGroupsByServedOrder({groups})),
      },
    ],
    secondaryRow: {
      rowName: SECONDARY_ROW_NAME,
      videoRankings: videos.map(video => ({
        videoCode: video.videoCode,
        rankedGroups: rankGroupsForTable({
          groups: readGroups({
            ...video,
            groups: buildPostDownloadGroups({
              video,
              copyCountByUrlCode: copyCountByVideoCode.get(video.videoCode),
            }),
          }),
          scoreTable: AIOSUBTITLES_SCORE_TABLE,
        }),
      })),
    },
  };
};

const summarizeView = ({videos, readGroups, copyCountByVideoCode}) => {
  const auditPassedCodes = new Set(
    videos.filter(video => video.isAuditPassed).map(video => video.videoCode),
  );
  const {primaryRows, secondaryRow} = buildRankingRows({
    videos,
    readGroups,
    copyCountByVideoCode,
  });
  const summarize = rankingRow =>
    summarizeRankingRow({...rankingRow, auditPassedCodes});
  return {
    primarySummaries: primaryRows.map(summarize),
    secondarySummary: summarize(secondaryRow),
  };
};

const toTimeFamilyVideo = ({videoCode, evalCase, contentGroups}) => ({
  videoCode,
  truth: {
    cues: evalCase.truthCues.map(([startMs, endMs]) => ({startMs, endMs})),
  },
  groups: contentGroups.map(contentGroup => ({
    groupClass: contentGroup.groupClass,
    timeFamily: contentGroup.timeFamily,
    cues: readGroupFileFacts(contentGroup)?.normalizedCues ?? [],
  })),
});

export const runScoreTablesCommand = async ({
  atlasRoot,
  codenames,
  commandOptions,
  writeLine,
  reportsDir = REPORTS_DIR,
}) => {
  const reportDate = commandOptions['report-date'];
  const frozenStore = createFrozenStore(atlasRoot);
  const [evalCases, runFingerprint, privateValues] = await Promise.all([
    readCorpus({atlasRoot, codenames}),
    readRunFingerprint(atlasRoot),
    readReportPrivateValues({atlasRoot, codenames}),
  ]);
  const videos = sortBy(
    await Promise.all(
      evalCases.map(evalCase => prepareVideo({evalCase, frozenStore})),
    ),
    [video => video.videoCode],
  );
  const nearDuplicateCheck = runNearDuplicateCheck({videos});
  const productGrouping = runProductGrouping({
    videos,
    textSimilarityMin: nearDuplicateCheck.threshold,
  });
  const {copyCountByVideoCode} = productGrouping;
  const groupView = summarizeView({
    videos,
    readGroups: video => video.groups,
    copyCountByVideoCode,
  });
  const markdown = buildReadyMadeReport({
    reportDate,
    runFingerprint,
    videos,
    groupView,
    rowView: summarizeView({
      videos,
      readGroups: video => splitIntoRows(video.groups),
      copyCountByVideoCode,
    }),
    comparisons: RankingLabel.values.map(label =>
      compareRankingRows({rowSummaries: groupView.primarySummaries, label}),
    ),
    tierOneRecall: runTierOneRecall({videos}),
    contentKeyAgreement: runContentKeyAgreement({videos}),
    nearDuplicateCheck,
    productGrouping,
    timeFamily: runTimeFamily({videos: videos.map(toTimeFamilyVideo)}),
  });
  const reportPath = await writeReport({
    reportsDir,
    reportDate,
    reportName: REPORT_NAME,
    markdown,
    privateValues,
  });
  writeLine(`report: ${reportPath}`);
  return reportPath;
};
