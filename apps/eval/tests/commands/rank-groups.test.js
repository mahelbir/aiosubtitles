import {beforeAll, describe, expect, it} from 'vitest';
import {
  ScoreTableMode,
  ScoringSignal,
} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {AIOSUBTITLES_SCORE_TABLE} from '@repo/subtitle-core/scoring/aiosubtitles-score-table.js';
import {
  buildRankingGroups,
  rankGroupsByServedOrder,
  rankGroupsForTable,
} from '../../src/commands/rank-groups.js';
import {buildEvalCandidates} from '../../src/commands/build-eval-candidates.js';
import {RankingLabel} from '../../src/constants/ranking-label.js';
import {createFrozenStore} from '../../src/corpus/frozen-store.js';
import {readCorpus} from '../../src/corpus/read-corpus.js';
import {
  computePairOrder,
  computeTopOne,
  computeWorstError,
  countInvalidAbovePositive,
} from '../../src/metrics/ranking-metrics.js';
import {ATLAS_FIXTURE_ROOT} from '../support/atlas-fixture.js';
import {
  RELEASE_NAMES,
  findReadyMadeTable,
  makeGroup,
  makeMember,
  makeNamedGroup,
} from './helpers/scoring-inputs.js';

const SUBLIMINAL_TABLE = findReadyMadeTable('subliminal');
const STRICT_PRIORITY_TABLE = findReadyMadeTable('strict-priority');
const ORION_TABLE = findReadyMadeTable('orion');

const FLOAT_POINTS_TABLE = {
  tableName: 'float-points',
  tableCitations: ['apps/eval/tests/commands/rank-groups.test.js'],
  tableMode: ScoreTableMode.ADDITIVE,
  signalPoints: {
    [ScoringSignal.RELEASE_GROUP]: {matchPoints: 0.1, conflictPoints: 0},
    [ScoringSignal.RESOLUTION]: {matchPoints: 0.2, conflictPoints: 0},
    [ScoringSignal.STREAMING_SERVICE]: {matchPoints: 0.3, conflictPoints: 0},
  },
};

const readScores = rankedGroups =>
  rankedGroups.map(rankedGroup => rankedGroup.groupScore);

const expectDenseIntegerRanks = scores => {
  expect(scores.every(Number.isInteger)).toBe(true);
  const distinctScores = [...new Set(scores)].toSorted(
    (first, second) => first - second,
  );
  expect(
    distinctScores
      .slice(1)
      .map((rankScore, rankIndex) => rankScore - distinctScores[rankIndex]),
  ).toEqual(Array.from({length: distinctScores.length - 1}, () => 1));
};

describe('rankGroupsForTable', () => {
  it('scores a group as its best member row (metrics §1.1)', () => {
    const rankedGroups = rankGroupsForTable({
      groups: [
        makeNamedGroup([null, RELEASE_NAMES.strong]),
        makeNamedGroup([RELEASE_NAMES.medium]),
        makeNamedGroup([null]),
        makeNamedGroup([RELEASE_NAMES.strong]),
      ],
      scoreTable: SUBLIMINAL_TABLE,
    });

    expect(rankedGroups).toHaveLength(4);
    const [mixedScore, mediumScore, weakScore, strongScore] =
      readScores(rankedGroups);
    expect(mixedScore).toBe(strongScore);
    expect(mixedScore).toBeGreaterThan(mediumScore);
    expect(mediumScore).toBeGreaterThan(weakScore);
  });

  it('gives an additive table dense integer ranks and keeps its ties', () => {
    const rankedGroups = rankGroupsForTable({
      groups: [
        makeNamedGroup([RELEASE_NAMES.strong]),
        makeNamedGroup([RELEASE_NAMES.medium]),
        makeNamedGroup([RELEASE_NAMES.medium]),
        makeNamedGroup([null]),
      ],
      scoreTable: SUBLIMINAL_TABLE,
    });

    expect(rankedGroups).toHaveLength(4);
    const scores = readScores(rankedGroups);
    expectDenseIntegerRanks(scores);
    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores[1]).toBe(scores[2]);
    expect(scores[2]).toBeGreaterThan(scores[3]);
  });

  it('gives a strict-priority table dense integer ranks and keeps its ties', () => {
    const rankedGroups = rankGroupsForTable({
      groups: [
        makeNamedGroup([RELEASE_NAMES.groupOnly]),
        makeNamedGroup([RELEASE_NAMES.serviceSourceResolution]),
        makeNamedGroup([RELEASE_NAMES.groupOnly]),
        makeNamedGroup([null]),
      ],
      scoreTable: STRICT_PRIORITY_TABLE,
    });

    expect(rankedGroups).toHaveLength(4);
    const scores = readScores(rankedGroups);
    expectDenseIntegerRanks(scores);
    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores[0]).toBe(scores[2]);
    expect(scores[1]).toBeGreaterThan(scores[3]);
  });

  it('orders a tiered table by its tiers before its points', () => {
    const rankedGroups = rankGroupsForTable({
      groups: [
        makeGroup({
          members: [
            makeMember({
              releaseNames: [RELEASE_NAMES.strong],
              candidateOverrides: {isQuotaCostly: true},
            }),
          ],
        }),
        makeNamedGroup([null]),
      ],
      scoreTable: ORION_TABLE,
    });

    expect(rankedGroups).toHaveLength(2);
    const [quotaCostlyScore, freeScore] = readScores(rankedGroups);
    expect(freeScore).toBeGreaterThan(quotaCostlyScore);
    expectDenseIntegerRanks([quotaCostlyScore, freeScore]);
  });

  it('rounds both sides to 6 decimals before it decides a tie (D17)', () => {
    const rankedGroups = rankGroupsForTable({
      groups: [
        makeNamedGroup([RELEASE_NAMES.groupAndResolution]),
        makeNamedGroup([RELEASE_NAMES.serviceOnly]),
        makeNamedGroup([RELEASE_NAMES.strong]),
      ],
      scoreTable: FLOAT_POINTS_TABLE,
    });

    expect(rankedGroups).toHaveLength(3);
    const [summedScore, singleScore, strongScore] = readScores(rankedGroups);
    expect(summedScore).toBe(singleScore);
    expect(strongScore).toBeGreaterThan(singleScore);
  });

  it('puts every hard-rejected group at one shared rank below every kept group (metrics §1.1b)', () => {
    const rankedGroups = rankGroupsForTable({
      groups: [
        makeNamedGroup([RELEASE_NAMES.negative]),
        makeNamedGroup([RELEASE_NAMES.wrongEpisode]),
        makeNamedGroup([RELEASE_NAMES.strong]),
        makeNamedGroup([RELEASE_NAMES.wrongSeason]),
        makeNamedGroup([RELEASE_NAMES.wrongEpisode, RELEASE_NAMES.wrongSeason]),
      ],
      scoreTable: AIOSUBTITLES_SCORE_TABLE,
    });

    expect(rankedGroups).toHaveLength(5);
    const scores = readScores(rankedGroups);
    const keptScores = [scores[0], scores[2]];
    const droppedScores = [scores[1], scores[3], scores[4]];
    expectDenseIntegerRanks(keptScores);
    expect(new Set(droppedScores).size).toBe(1);
    expect(droppedScores[0]).toBeLessThan(Math.min(...keptScores));
  });

  it('puts a hard-rejected group below a zero-point kept group under strict priority', () => {
    const rankedGroups = rankGroupsForTable({
      groups: [
        makeNamedGroup([RELEASE_NAMES.wrongEpisode]),
        makeNamedGroup([null]),
        makeNamedGroup([RELEASE_NAMES.wrongSeason]),
      ],
      scoreTable: STRICT_PRIORITY_TABLE,
    });

    expect(rankedGroups).toHaveLength(3);
    const [wrongEpisodeScore, keptScore, wrongSeasonScore] =
      readScores(rankedGroups);
    expect(wrongEpisodeScore).toBe(wrongSeasonScore);
    expect(wrongEpisodeScore).toBeLessThan(keptScore);
  });

  it.each([
    ['an additive', AIOSUBTITLES_SCORE_TABLE, RELEASE_NAMES.negative],
    ['a strict-priority', STRICT_PRIORITY_TABLE, null],
    ['a tiered', ORION_TABLE, RELEASE_NAMES.negative],
  ])(
    'lets no hard-rejected row win its group under %s table',
    (_, scoreTable, keptReleaseName) => {
      const rankedGroups = rankGroupsForTable({
        groups: [
          makeNamedGroup([RELEASE_NAMES.wrongEpisode, keptReleaseName]),
          makeNamedGroup([keptReleaseName]),
          makeNamedGroup([RELEASE_NAMES.wrongEpisode]),
          makeNamedGroup([RELEASE_NAMES.strong]),
        ],
        scoreTable,
      });

      expect(rankedGroups).toHaveLength(4);
      const [mixedScore, keptScore, droppedScore, strongScore] =
        readScores(rankedGroups);
      expect(mixedScore).toBe(keptScore);
      expect(mixedScore).toBeGreaterThan(droppedScore);
      expect(strongScore).toBeGreaterThan(mixedScore);
    },
  );

  it('keeps the class and validity of each group in input order', () => {
    const groups = [
      makeNamedGroup([RELEASE_NAMES.medium], {groupClass: 'wrong'}),
      makeNamedGroup([RELEASE_NAMES.strong], {groupClass: 'fits'}),
      makeNamedGroup([RELEASE_NAMES.strong], {isValid: false}),
      makeNamedGroup([null], {groupClass: 'constant'}),
    ];

    const rankedGroups = rankGroupsForTable({
      groups,
      scoreTable: SUBLIMINAL_TABLE,
    });

    expect(rankedGroups).toHaveLength(4);
    expect(
      rankedGroups.map(({groupClass, isValid}) => ({groupClass, isValid})),
    ).toEqual(groups.map(({groupClass, isValid}) => ({groupClass, isValid})));
  });

  it('ranks invalid rows beside the groups so the numeric metrics read the order', () => {
    const rankedGroups = rankGroupsForTable({
      groups: [
        makeNamedGroup([RELEASE_NAMES.strong], {groupClass: 'fits'}),
        makeNamedGroup([null], {groupClass: 'wrong'}),
        makeNamedGroup([RELEASE_NAMES.strong], {isValid: false}),
      ],
      scoreTable: STRICT_PRIORITY_TABLE,
    });
    const reversedGroups = rankGroupsForTable({
      groups: [
        makeNamedGroup([null], {groupClass: 'fits'}),
        makeNamedGroup([RELEASE_NAMES.strong], {groupClass: 'wrong'}),
      ],
      scoreTable: STRICT_PRIORITY_TABLE,
    });

    expect(rankedGroups).toHaveLength(3);
    expect(reversedGroups).toHaveLength(2);
    const ranking = {rankedGroups, label: RankingLabel.Y1};
    const reversedRanking = {
      rankedGroups: reversedGroups,
      label: RankingLabel.Y1,
    };
    expect(computePairOrder(ranking)).toBe(1);
    expect(computeTopOne(ranking)).toBe(1);
    expect(countInvalidAbovePositive(ranking)).toBe(0.5);
    expect(computePairOrder(reversedRanking)).toBe(0);
    expect(computeWorstError(reversedRanking)).toBe(1);
  });
});

describe('rankGroupsByServedOrder', () => {
  it('scores each group as minus its best 1-based served position', () => {
    const groups = [
      makeGroup({
        groupClass: 'fits',
        members: [makeMember({servedIndex: 3}), makeMember({servedIndex: 1})],
      }),
      makeGroup({groupClass: 'wrong', members: [makeMember({servedIndex: 0})]}),
      makeGroup({isValid: false, members: [makeMember({servedIndex: 4})]}),
    ];

    expect(rankGroupsByServedOrder({groups})).toEqual([
      {groupClass: 'fits', groupScore: -2, isValid: true},
      {groupClass: 'wrong', groupScore: -1, isValid: true},
      {groupClass: null, groupScore: -5, isValid: false},
    ]);
  });
});

describe('buildRankingGroups', () => {
  let evalCaseByCode;
  let groupsByCode;

  beforeAll(async () => {
    const evalCases = await readCorpus({atlasRoot: ATLAS_FIXTURE_ROOT});
    const frozenStore = createFrozenStore(ATLAS_FIXTURE_ROOT);
    evalCaseByCode = new Map(
      evalCases.map(evalCase => [evalCase.caseCode, evalCase]),
    );
    groupsByCode = new Map(
      await Promise.all(
        evalCases.map(async evalCase => [
          evalCase.caseCode,
          buildRankingGroups({
            evalCase,
            candidates: await buildEvalCandidates({evalCase, frozenStore}),
          }),
        ]),
      ),
    );
  });

  const summarizeGroups = groups =>
    groups.map(({groupClass, isValid, members}) => ({
      groupClass,
      isValid,
      servedIndexes: members.map(member => member.servedIndex),
    }));

  it('groups the valid pool rows by content and keeps each invalid row alone', () => {
    const groups = groupsByCode.get('V90');

    expect(groups).toHaveLength(4);
    expect(summarizeGroups(groups)).toEqual(
      expect.arrayContaining([
        {groupClass: 'fits', isValid: true, servedIndexes: [0, 1]},
        {groupClass: 'wrong', isValid: true, servedIndexes: [2]},
        {groupClass: null, isValid: false, servedIndexes: [3]},
        {groupClass: null, isValid: false, servedIndexes: [4]},
      ]),
    );
  });

  it('builds the one wrong group of the film video from both of its rows', () => {
    expect(summarizeGroups(groupsByCode.get('V92') ?? [])).toEqual([
      {groupClass: 'wrong', isValid: true, servedIndexes: [0, 1]},
    ]);
  });

  it('parses every release name of each member into its releases', () => {
    const members = [...groupsByCode.values()]
      .flat()
      .flatMap(group => group?.members ?? []);

    expect(members).toHaveLength(7);
    for (const member of members) {
      expect(member.candidateReleases).toHaveLength(
        member.candidate.releaseNames.length,
      );
    }
    expect(
      members.find(
        member => member.servedIndex === 4 && member.video.catalogSeason === 1,
      )?.candidateReleases,
    ).toHaveLength(2);
  });

  it('never hands a video hash to the scorer (metrics §1.1a)', () => {
    const members = [...groupsByCode.values()]
      .flat()
      .flatMap(group => group?.members ?? []);

    expect(evalCaseByCode.get('V90').video.videoHash).not.toBeNull();
    expect(members).toHaveLength(7);
    expect(members.map(member => member.video.videoHash)).toEqual(
      Array.from({length: 7}, () => null),
    );
  });
});
