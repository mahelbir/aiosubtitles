import {describe, expect, it} from 'vitest';
import {
  TIME_FAMILY_GRID,
  computeFamilyAgreement,
  computeTruthReferenceAgreement,
  selectTimeFamilyParameters,
} from '../../src/metrics/time-family-metrics.js';

const buildFamilyGroup = (groupName, timeFamily, groupClass) => ({
  groupName,
  timeFamily,
  groupClass,
});

const isReferenceInFamilyOne = reference => reference.timeFamily === 'F1';

describe('computeFamilyAgreement', () => {
  const videos = [
    {
      videoCode: 'V01',
      groups: [
        buildFamilyGroup('g1', 'F1', 'fits'),
        buildFamilyGroup('g2', 'F1', 'wrong'),
        buildFamilyGroup('g3', 'F2', 'fits'),
      ],
    },
    {
      videoCode: 'V02',
      groups: [
        buildFamilyGroup('g4', 'F3', 'fits'),
        buildFamilyGroup('g5', 'F3', 'fits'),
      ],
    },
    {videoCode: 'V03', groups: [buildFamilyGroup('g6', null, 'fits')]},
    {
      videoCode: 'V04',
      groups: [
        buildFamilyGroup('g7', null, 'wrong'),
        buildFamilyGroup('g8', null, 'wrong'),
      ],
    },
    {
      videoCode: 'V05',
      groups: [
        buildFamilyGroup('g9', 'F5', 'fits'),
        buildFamilyGroup('g10', 'F5', 'fits'),
        buildFamilyGroup('g11', 'F6', 'wrong'),
      ],
    },
  ];

  const agreement = () =>
    computeFamilyAgreement({videos, isSameTimeFamily: isReferenceInFamilyOne});

  it('scores both orders of every pair under an asymmetric decision', () => {
    expect(agreement().videos[0]).toEqual({
      videoCode: 'V01',
      precision: 0.5,
      recall: 1,
      balancedAccuracy: 0.75,
      crossClassSameCount: 3,
    });
  });

  it('lets a video with only same-family pairs enter recall only', () => {
    expect(agreement().videos[1]).toEqual({
      videoCode: 'V02',
      precision: null,
      recall: 0,
      balancedAccuracy: null,
      crossClassSameCount: 0,
    });
  });

  it('enters nothing for a single group or for null families only', () => {
    const emptyEntry = {
      precision: null,
      recall: null,
      balancedAccuracy: null,
      crossClassSameCount: 0,
    };
    expect(agreement().videos[2]).toEqual({videoCode: 'V03', ...emptyEntry});
    expect(agreement().videos[3]).toEqual({videoCode: 'V04', ...emptyEntry});
  });

  it('leaves precision out when nothing is predicted the same', () => {
    expect(agreement().videos[4]).toEqual({
      videoCode: 'V05',
      precision: null,
      recall: 0,
      balancedAccuracy: 0.5,
      crossClassSameCount: 0,
    });
  });

  it('takes the macro mean over the videos each sub-metric is defined on', () => {
    expect(agreement()).toEqual(
      expect.objectContaining({
        macro: {
          precision: {value: 0.5, definedVideoCount: 1, videoCount: 5},
          recall: {
            value: expect.closeTo(1 / 3, 12),
            definedVideoCount: 3,
            videoCount: 5,
          },
          balancedAccuracy: {
            value: 0.625,
            definedVideoCount: 2,
            videoCount: 5,
          },
        },
        crossClassSameCount: 3,
      }),
    );
  });
});

describe('computeTruthReferenceAgreement', () => {
  const truth = {truthCues: []};
  const buildTruthGroup = (groupClass, isNear) => ({groupClass, isNear});
  const isNearTruth = (reference, candidate) =>
    reference === truth && candidate.isNear;
  const videos = [
    {
      videoCode: 'V06',
      truth,
      groups: [
        buildTruthGroup('fits', true),
        buildTruthGroup('wrong', true),
        buildTruthGroup('constant', false),
        buildTruthGroup('fits', false),
      ],
    },
    {videoCode: 'V25', truth, groups: [buildTruthGroup('fits', true)]},
    {videoCode: 'E16', truth, groups: [buildTruthGroup('wrong', true)]},
  ];

  it('scores fits against the truth track per video', () => {
    expect(
      computeTruthReferenceAgreement({videos, isSameTimeFamily: isNearTruth}),
    ).toEqual({
      videos: [
        {videoCode: 'V06', precision: 0.5, recall: 0.5},
        {videoCode: 'V25', precision: null, recall: 1},
        {videoCode: 'E16', precision: null, recall: null},
      ],
      macro: {
        precision: {value: 0.5, definedVideoCount: 1, videoCount: 3},
        recall: {value: 0.75, definedVideoCount: 2, videoCount: 3},
      },
    });
  });

  it('leaves precision undefined when no group is predicted fits', () => {
    expect(
      computeTruthReferenceAgreement({
        videos: [
          {
            videoCode: 'V08',
            truth,
            groups: [
              buildTruthGroup('fits', false),
              buildTruthGroup('wrong', false),
            ],
          },
        ],
        isSameTimeFamily: isNearTruth,
      }),
    ).toEqual({
      videos: [{videoCode: 'V08', precision: null, recall: 0}],
      macro: {
        precision: {value: null, definedVideoCount: 0, videoCount: 1},
        recall: {value: 0, definedVideoCount: 1, videoCount: 1},
      },
    });
  });
});

describe('TIME_FAMILY_GRID', () => {
  it('holds every tolerance and share of metrics §5.3', () => {
    expect(TIME_FAMILY_GRID).toHaveLength(28);
    expect(
      new Set(TIME_FAMILY_GRID.map(setting => setting.startToleranceMs)),
    ).toEqual(new Set([50, 100, 150, 200, 250, 300, 350]));
    expect(
      new Set(TIME_FAMILY_GRID.map(setting => setting.matchedShareMin)),
    ).toEqual(new Set([0.8, 0.85, 0.9, 0.95]));
  });
});

describe('selectTimeFamilyParameters', () => {
  const settingOne = {startToleranceMs: 100, matchedShareMin: 0.9};
  const settingTwo = {startToleranceMs: 50, matchedShareMin: 0.8};
  const settingThree = {startToleranceMs: 50, matchedShareMin: 0.95};
  const settingFour = {startToleranceMs: 200, matchedShareMin: 0.85};
  const scoreTable = new Map([
    ['A', new Map([[settingOne, 1]])],
    [
      'B',
      new Map([
        [settingTwo, 1],
        [settingThree, 1],
      ]),
    ],
    ['C', new Map([[settingFour, 1]])],
  ]);
  const videos = ['A', 'B', 'C'].map(videoCode => ({videoCode}));
  const scoredVideoSets = [];
  const scoreSetting = ({setting, videos: trainingVideos}) => {
    scoredVideoSets.push(trainingVideos.map(video => video.videoCode).join());
    return (
      trainingVideos.reduce(
        (total, video) =>
          total + (scoreTable.get(video.videoCode).get(setting) ?? 0),
        0,
      ) / trainingVideos.length
    );
  };

  it('chooses on the other videos for each held-out video and on all for the final', () => {
    expect(
      selectTimeFamilyParameters({
        grid: [settingOne, settingTwo, settingThree, settingFour],
        videos,
        scoreSetting,
      }),
    ).toEqual({
      setting: settingThree,
      criterion: expect.closeTo(1 / 3, 12),
      heldOut: [
        {videoCode: 'A', setting: settingThree, trainingCriterion: 0.5},
        {videoCode: 'B', setting: settingOne, trainingCriterion: 0.5},
        {videoCode: 'C', setting: settingThree, trainingCriterion: 0.5},
      ],
    });
    expect(new Set(scoredVideoSets)).toEqual(
      new Set(['A,B,C', 'B,C', 'A,C', 'A,B']),
    );
  });

  it('prefers any defined criterion over an undefined one', () => {
    const selection = selectTimeFamilyParameters({
      grid: [settingTwo, settingFour],
      videos: [{videoCode: 'A'}],
      scoreSetting: ({setting}) => (setting === settingTwo ? null : 0),
    });
    expect(selection.setting).toBe(settingFour);
    expect(selection.criterion).toBe(0);
  });

  it('keeps a defined criterion over a later undefined one', () => {
    const selection = selectTimeFamilyParameters({
      grid: [settingFour, settingTwo],
      videos: [{videoCode: 'A'}],
      scoreSetting: ({setting}) => (setting === settingFour ? null : -0.5),
    });
    expect(selection.setting).toBe(settingTwo);
    expect(selection.criterion).toBe(-0.5);
  });

  it('keeps the first setting in tie order when no criterion is defined', () => {
    const selection = selectTimeFamilyParameters({
      grid: [settingFour, settingTwo, settingThree],
      videos: [{videoCode: 'A'}],
      scoreSetting: () => null,
    });
    expect(selection.setting).toBe(settingThree);
    expect(selection.criterion).toBeNull();
  });

  it('ties criteria equal at six decimals and keeps the smaller tolerance', () => {
    const perVideoValues = new Map([
      [settingTwo, [0.15, 0.15]],
      [settingOne, [0.1, 0.2]],
    ]);
    const selection = selectTimeFamilyParameters({
      grid: [settingOne, settingTwo],
      videos: [{videoCode: 'A'}],
      scoreSetting: ({setting}) => {
        const [first, second] = perVideoValues.get(setting);
        return (first + second) / 2;
      },
    });
    expect(selection.setting).toBe(settingTwo);
  });
});
