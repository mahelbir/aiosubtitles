import {beforeAll, describe, expect, it} from 'vitest';
import {AIOSUBTITLES_SCORE_TABLE} from '@repo/subtitle-core/scoring/aiosubtitles-score-table.js';
import {buildEvalCandidates} from '../../src/commands/build-eval-candidates.js';
import {
  DROPPED_GROUP_SCORE,
  buildRankingGroups,
  rankGroupsForTable,
} from '../../src/commands/rank-groups.js';
import {buildPostDownloadGroups} from '../../src/commands/score-tables.js';
import {createFrozenStore} from '../../src/corpus/frozen-store.js';
import {readCorpus} from '../../src/corpus/read-corpus.js';
import {ATLAS_FIXTURE_ROOT} from '../support/atlas-fixture.js';

const DURATION_SECONDS = 1500;

describe('ranking-run rulings on the fixture', () => {
  let evalCase;
  let candidates;

  beforeAll(async () => {
    const evalCases = await readCorpus({atlasRoot: ATLAS_FIXTURE_ROOT});
    evalCase = evalCases.find(({caseCode}) => caseCode === 'V90');
    candidates = await buildEvalCandidates({
      evalCase,
      frozenStore: createFrozenStore(ATLAS_FIXTURE_ROOT),
    });
  });

  it('never lets an invalid file reject or lower a group in the primary run', () => {
    expect(
      candidates.filter(
        candidate => candidate.fileFacts?.isFileValid === false,
      ),
    ).toHaveLength(2);

    const groups = buildRankingGroups({evalCase, candidates});
    const rankedGroups = rankGroupsForTable({
      groups,
      scoreTable: AIOSUBTITLES_SCORE_TABLE,
    });

    expect(
      groups.flatMap(group =>
        group.members.map(member => member.candidate.fileFacts),
      ),
    ).toEqual(Array.from({length: 5}, () => null));
    expect(
      rankedGroups.filter(
        rankedGroup => rankedGroup.groupScore === DROPPED_GROUP_SCORE,
      ),
    ).toEqual([]);
  });

  it('feeds the secondary run its copy count, unknown validity and the record duration', () => {
    const copyCountByUrlCode = new Map(
      candidates.map((candidate, candidateIndex) => [
        candidate.urlCode,
        candidateIndex,
      ]),
    );

    const groups = buildPostDownloadGroups({
      video: {
        evalCase: {
          ...evalCase,
          video: {...evalCase.video, durationSeconds: DURATION_SECONDS},
        },
        candidates,
        videoContext: {catalogDurationMs: null, videoHash: null},
      },
      copyCountByUrlCode,
    });
    const members = groups.flatMap(group => group.members);

    expect(members).toHaveLength(5);
    for (const member of members) {
      expect(member.candidate.fileFacts.isFileValid).toBeNull();
      expect(member.candidate.fileFacts.cueCount).toBeGreaterThanOrEqual(0);
      expect(member.candidate.independentCopyCount).toBe(
        copyCountByUrlCode.get(member.candidate.urlCode),
      );
      expect(member.candidate.referenceComparison).toBeNull();
      expect(member.video.catalogDurationMs).toBe(DURATION_SECONDS * 1000);
    }
    expect(
      rankGroupsForTable({groups, scoreTable: AIOSUBTITLES_SCORE_TABLE}).filter(
        rankedGroup => rankedGroup.groupScore === DROPPED_GROUP_SCORE,
      ),
    ).toEqual([]);
  });
});
