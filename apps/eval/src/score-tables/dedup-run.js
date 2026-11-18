import {meanBy, sumBy, zip} from 'es-toolkit';
import {
  areCuesNearDuplicate,
  measureTextSimilarity,
} from '@repo/subtitle-core/deduplication/are-cues-near-duplicate.js';
import {mergeDuplicateGroup} from '@repo/subtitle-core/deduplication/merge-duplicate-group.js';
import {
  groupDuplicatesPerLanguage,
  readTierOneKey,
} from '../commands/build-eval-candidates.js';
import {
  checkNearDuplicateThreshold,
  computeContentKeyAgreement,
  computeTierOneTwoRecall,
  deriveNearDuplicateThreshold,
} from '../metrics/dedup-metrics.js';
import {listUnorderedPairs} from '../metrics/metric-math.js';
import {readGroupFileFacts} from './group-file-facts.js';

const TIME_EQUAL_SIMILARITY_MIN = 0;

const listVideoRows = videos =>
  videos.flatMap(({videoCode, contentGroups}) =>
    contentGroups.flatMap(({groupClass, rows}) =>
      rows.map(row => ({videoCode, groupClass, ...row})),
    ),
  );

export const runTierOneRecall = ({videos}) =>
  computeTierOneTwoRecall({
    rows: listVideoRows(videos).map(
      ({videoCode, candidate, corpusCandidate}) => ({
        videoCode,
        candidateKey: corpusCandidate.candidateKey,
        subtitleSource: candidate.subtitleSource,
        tierOneKey: readTierOneKey(candidate),
      }),
    ),
  });

export const runContentKeyAgreement = ({videos}) =>
  computeContentKeyAgreement({
    rows: listVideoRows(videos).map(
      ({videoCode, groupClass, candidate, corpusCandidate}) => ({
        videoCode,
        groupClass,
        contentKey: candidate.fileFacts?.contentKey ?? null,
        candidateKey: corpusCandidate.candidateKey,
        rawSha256: corpusCandidate.rawSha256,
      }),
    ),
  });

const isNearDuplicateAt = (cuesA, cuesB, textSimilarityMin) =>
  areCuesNearDuplicate({cuesA, cuesB, textSimilarityMin});

const measureCueSimilarity = (cuesA, cuesB) =>
  meanBy(zip(cuesA, cuesB), ([cueA, cueB]) =>
    measureTextSimilarity(cueA.text, cueB.text),
  );

const readGroupCues = contentGroup => {
  const fileFacts = readGroupFileFacts(contentGroup);
  return fileFacts?.isFileValid === true ? fileFacts.normalizedCues : null;
};

export const listTimeEqualPairs = ({videos}) =>
  videos.flatMap(({videoCode, contentGroups}) =>
    listUnorderedPairs(
      contentGroups
        .map(contentGroup => ({
          groupClass: contentGroup.groupClass,
          cues: readGroupCues(contentGroup),
        }))
        .filter(({cues}) => cues !== null),
    )
      .filter(([first, second]) =>
        isNearDuplicateAt(first.cues, second.cues, TIME_EQUAL_SIMILARITY_MIN),
      )
      .map(([first, second]) => ({
        videoCode,
        groupClasses: [first.groupClass, second.groupClass],
        similarity: measureCueSimilarity(first.cues, second.cues),
      })),
  );

export const runNearDuplicateCheck = ({videos}) => {
  const timeEqualPairs = listTimeEqualPairs({videos});
  const {threshold, crossClassSimilarityMax} = deriveNearDuplicateThreshold({
    timeEqualPairs,
  });
  return {
    threshold,
    crossClassSimilarityMax,
    thresholdCheck: checkNearDuplicateThreshold({
      pairs: timeEqualPairs,
      threshold,
    }),
  };
};

const mapCopyCounts = ({duplicateGroups, videoRelease}) =>
  new Map(
    duplicateGroups.flatMap(group => {
      const {independentCopyCount} = mergeDuplicateGroup({group, videoRelease});
      return group.members.map(member => [
        member.urlCode,
        independentCopyCount,
      ]);
    }),
  );

export const runProductGrouping = ({videos, textSimilarityMin}) => {
  const videoGroupings = videos.map(
    ({videoCode, candidates, videoContext}) => ({
      videoCode,
      candidates,
      videoRelease: videoContext.videoRelease,
      duplicateGroups: groupDuplicatesPerLanguage({
        candidates,
        textSimilarityMin,
      }),
    }),
  );
  return {
    rowCount: sumBy(videoGroupings, ({candidates}) => candidates.length),
    missingSiteIdRowCount: sumBy(
      videoGroupings,
      ({candidates}) =>
        candidates.filter(candidate => candidate.siteFileId === null).length,
    ),
    duplicateGroupCount: sumBy(
      videoGroupings,
      ({duplicateGroups}) => duplicateGroups.length,
    ),
    copyCountByVideoCode: new Map(
      videoGroupings.map(videoGrouping => [
        videoGrouping.videoCode,
        mapCopyCounts(videoGrouping),
      ]),
    ),
  };
};
