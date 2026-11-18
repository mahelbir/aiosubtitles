import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  ScoreTableMode,
  ScoringSignal,
} from '../../src/constants/subtitle-core-enums.js';
import {assertScoreTable} from '../../src/scoring/assert-score-table.js';
import {makeScoreTable} from '../helpers/factories.js';

const GROUP_POINTS = {
  [ScoringSignal.RELEASE_GROUP]: {matchPoints: 40, conflictPoints: -10},
};
const MODE_ORDER_FIELDS = {
  [ScoreTableMode.ADDITIVE]: {},
  [ScoreTableMode.STRICT_PRIORITY]: {
    priorityOrder: [ScoringSignal.RELEASE_GROUP],
  },
  [ScoreTableMode.TIERED]: {tierOrder: []},
};

describe('assertScoreTable', () => {
  it('accepts a well-formed additive table', () => {
    expect(() =>
      assertScoreTable(makeScoreTable({signalPoints: GROUP_POINTS})),
    ).not.toThrow();
  });

  it('accepts a strict-priority table with a priority order', () => {
    expect(() =>
      assertScoreTable(
        makeScoreTable({
          tableMode: ScoreTableMode.STRICT_PRIORITY,
          signalPoints: GROUP_POINTS,
          priorityOrder: [ScoringSignal.RELEASE_GROUP],
        }),
      ),
    ).not.toThrow();
  });

  it('rejects a key that is not a scoring signal', () => {
    expect(() =>
      assertScoreTable(
        makeScoreTable({
          signalPoints: {
            ...GROUP_POINTS,
            'paid-subtitle': {matchPoints: 0, conflictPoints: -5},
          },
        }),
      ),
    ).toThrow();
  });

  it.each([
    ['matchPoints', Number.NaN],
    ['conflictPoints', Number.POSITIVE_INFINITY],
    ['strongConflictPoints', Number.NEGATIVE_INFINITY],
    ['maxPoints', Number.NaN],
    ['matchPoints', '40'],
  ])('rejects a %s of %s', (pointsField, pointsNumber) => {
    expect(() =>
      assertScoreTable(
        makeScoreTable({
          signalPoints: {
            [ScoringSignal.RELEASE_GROUP]: {
              ...GROUP_POINTS[ScoringSignal.RELEASE_GROUP],
              [pointsField]: pointsNumber,
            },
          },
        }),
      ),
    ).toThrow();
  });

  it('rejects a table without citations', () => {
    expect(() =>
      assertScoreTable(
        makeScoreTable({signalPoints: GROUP_POINTS, tableCitations: []}),
      ),
    ).toThrow();
  });

  it('rejects a strict-priority table without a priority order', () => {
    expect(() =>
      assertScoreTable(
        makeScoreTable({
          tableMode: ScoreTableMode.STRICT_PRIORITY,
          signalPoints: GROUP_POINTS,
        }),
      ),
    ).toThrow();
  });

  it('rejects an unknown table mode', () => {
    expect(() =>
      assertScoreTable(
        makeScoreTable({tableMode: 'weighted', signalPoints: GROUP_POINTS}),
      ),
    ).toThrow();
  });

  it('rejects a priority order naming a non-signal', () => {
    expect(() =>
      assertScoreTable(
        makeScoreTable({
          tableMode: ScoreTableMode.STRICT_PRIORITY,
          signalPoints: GROUP_POINTS,
          priorityOrder: [ScoringSignal.RELEASE_GROUP, 'paid-subtitle'],
        }),
      ),
    ).toThrow();
  });

  it.each([[undefined], [null], [[]], ['points']])(
    'rejects signal points of %j with a score table message',
    signalPoints => {
      expect(() => assertScoreTable(makeScoreTable({signalPoints}))).toThrow(
        /^Score table /,
      );
    },
  );

  it('accepts episode signal points', () => {
    expect(() =>
      assertScoreTable(
        makeScoreTable({
          signalPoints: GROUP_POINTS,
          episodeSignalPoints: {
            [ScoringSignal.RELEASE_GROUP]: {matchPoints: 20, conflictPoints: 0},
          },
        }),
      ),
    ).not.toThrow();
  });

  it('rejects an episode signal points key that is not a scoring signal', () => {
    expect(() =>
      assertScoreTable(
        makeScoreTable({
          signalPoints: GROUP_POINTS,
          episodeSignalPoints: {
            'paid-subtitle': {matchPoints: 0, conflictPoints: -5},
          },
        }),
      ),
    ).toThrow(/^Score table .*"paid-subtitle"/);
  });

  it('rejects an episode signal entry without finite points', () => {
    expect(() =>
      assertScoreTable(
        makeScoreTable({
          signalPoints: GROUP_POINTS,
          episodeSignalPoints: {
            [ScoringSignal.RELEASE_GROUP]: {
              matchPoints: Number.NaN,
              conflictPoints: 0,
            },
          },
        }),
      ),
    ).toThrow(/^Score table /);
  });

  it.each([[null], [[]], ['points']])(
    'rejects episode signal points of %j',
    episodeSignalPoints => {
      expect(() =>
        assertScoreTable(
          makeScoreTable({signalPoints: GROUP_POINTS, episodeSignalPoints}),
        ),
      ).toThrow(/^Score table .*episodeSignalPoints/);
    },
  );

  it('names the episode map when one of its entries is at fault', () => {
    expect(() =>
      assertScoreTable(
        makeScoreTable({
          signalPoints: GROUP_POINTS,
          episodeSignalPoints: {
            [ScoringSignal.RELEASE_GROUP]: {
              matchPoints: 1,
              conflictPoints: '0',
            },
          },
        }),
      ),
    ).toThrow(/^Score table .*episodeSignalPoints/);
  });

  it('names the base map when one of its entries is at fault', () => {
    expect(() =>
      assertScoreTable(
        makeScoreTable({
          signalPoints: {
            [ScoringSignal.RELEASE_GROUP]: {
              matchPoints: 1,
              conflictPoints: '0',
            },
          },
        }),
      ),
    ).toThrow(/^Score table .*signalPoints/);
  });

  it.each([
    ['tierOrder', ScoreTableMode.ADDITIVE],
    ['tierOrder', ScoreTableMode.STRICT_PRIORITY],
    ['priorityOrder', ScoreTableMode.ADDITIVE],
    ['priorityOrder', ScoreTableMode.TIERED],
  ])('rejects a %s on a %s table', (orderField, tableMode) => {
    expect(() =>
      assertScoreTable(
        makeScoreTable({
          tableMode,
          signalPoints: GROUP_POINTS,
          ...MODE_ORDER_FIELDS[tableMode],
          [orderField]: [ScoringSignal.RELEASE_GROUP],
        }),
      ),
    ).toThrow(new RegExp(`^Score table .*${orderField}`));
  });

  it.each([
    [ScoreTableMode.STRICT_PRIORITY, 'priorityOrder'],
    [ScoreTableMode.TIERED, 'tierOrder'],
  ])(
    'rejects a %s order member without a points entry',
    (tableMode, orderField) => {
      expect(() =>
        assertScoreTable(
          makeScoreTable({
            tableMode,
            signalPoints: GROUP_POINTS,
            [orderField]: [ScoringSignal.RELEASE_GROUP, ScoringSignal.FORCED],
          }),
        ),
      ).toThrow(/^Score table .*"forced"/);
    },
  );

  it('accepts a tiered table with a tier order and a score bucket size', () => {
    expect(() =>
      assertScoreTable(
        makeScoreTable({
          tableMode: ScoreTableMode.TIERED,
          signalPoints: GROUP_POINTS,
          tierOrder: [ScoringSignal.RELEASE_GROUP],
          scoreBucketSize: 10,
        }),
      ),
    ).not.toThrow();
  });

  it('accepts a tiered table with an empty tier order', () => {
    expect(() =>
      assertScoreTable(
        makeScoreTable({
          tableMode: ScoreTableMode.TIERED,
          signalPoints: GROUP_POINTS,
          tierOrder: [],
        }),
      ),
    ).not.toThrow();
  });

  it.each([[undefined], [null], ['quota-costly']])(
    'rejects a tiered table with a tier order of %j',
    tierOrder => {
      expect(() =>
        assertScoreTable(
          makeScoreTable({
            tableMode: ScoreTableMode.TIERED,
            signalPoints: GROUP_POINTS,
            tierOrder,
          }),
        ),
      ).toThrow(/^Score table /);
    },
  );

  it('rejects a tier order naming a non-signal', () => {
    expect(() =>
      assertScoreTable(
        makeScoreTable({
          tableMode: ScoreTableMode.TIERED,
          signalPoints: GROUP_POINTS,
          tierOrder: ['paid-subtitle'],
        }),
      ),
    ).toThrow(/"paid-subtitle"/);
  });

  it.each([[0], [-10], [Number.POSITIVE_INFINITY], ['10']])(
    'rejects a score bucket size of %s',
    scoreBucketSize => {
      expect(() =>
        assertScoreTable(
          makeScoreTable({
            tableMode: ScoreTableMode.TIERED,
            signalPoints: GROUP_POINTS,
            tierOrder: [],
            scoreBucketSize,
          }),
        ),
      ).toThrow(/^Score table /);
    },
  );

  it('rejects a score bucket size on a table that is not tiered', () => {
    expect(() =>
      assertScoreTable(
        makeScoreTable({signalPoints: GROUP_POINTS, scoreBucketSize: 10}),
      ),
    ).toThrow(/^Score table /);
  });

  it('accepts subtitle source points keyed by subtitle sources', () => {
    expect(() =>
      assertScoreTable(
        makeScoreTable({
          signalPoints: GROUP_POINTS,
          subtitleSourcePoints: {
            [SubtitleSource.OPENSUBTITLES_V3]: 3,
            [SubtitleSource.SUBDL]: 2,
          },
        }),
      ),
    ).not.toThrow();
  });

  it('rejects a subtitle source points key that is not a subtitle source', () => {
    expect(() =>
      assertScoreTable(
        makeScoreTable({
          signalPoints: GROUP_POINTS,
          subtitleSourcePoints: {subsro: 2},
        }),
      ),
    ).toThrow(/^Score table "fixture-table" .*"subsro"/);
  });

  it.each([[Number.NaN], ['2'], [null]])(
    'rejects subtitle source points of %s',
    subtitleSourceWeight => {
      expect(() =>
        assertScoreTable(
          makeScoreTable({
            signalPoints: GROUP_POINTS,
            subtitleSourcePoints: {
              [SubtitleSource.SUBDL]: subtitleSourceWeight,
            },
          }),
        ),
      ).toThrow(/^Score table /);
    },
  );

  it.each([[null], [[]], ['subdl']])(
    'rejects a subtitle source points map of %j',
    subtitleSourcePoints => {
      expect(() =>
        assertScoreTable(
          makeScoreTable({signalPoints: GROUP_POINTS, subtitleSourcePoints}),
        ),
      ).toThrow(/^Score table /);
    },
  );

  it.each([[['']], [[42]], [['spec §9.2', '  ']]])(
    'rejects the citations %j',
    tableCitations => {
      expect(() =>
        assertScoreTable(
          makeScoreTable({signalPoints: GROUP_POINTS, tableCitations}),
        ),
      ).toThrow(/^Score table /);
    },
  );
});
