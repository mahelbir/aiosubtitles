import {describe, expect, it} from 'vitest';
import {
  ScoreTableMode,
  ScoringSignal,
} from '../../src/constants/subtitle-core-enums.js';
import {assertScoreTable} from '../../src/scoring/assert-score-table.js';
import {makeScoreTable} from '../helpers/factories.js';

const GROUP_POINTS = {
  [ScoringSignal.RELEASE_GROUP]: {matchPoints: 40, conflictPoints: -10},
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
