import {isPlainObject} from 'es-toolkit';
import {
  ScoreTableMode,
  ScoringSignal,
} from '../constants/subtitle-core-enums.js';

const isCitationText = tableCitation =>
  typeof tableCitation === 'string' && tableCitation.trim().length > 0;

const REQUIRED_POINTS_FIELDS = Object.freeze(['matchPoints', 'conflictPoints']);
const OPTIONAL_POINTS_FIELDS = Object.freeze([
  'strongConflictPoints',
  'maxPoints',
]);

const assertScoringSignal = (tableName, scoringSignal) => {
  if (!ScoringSignal.values.includes(scoringSignal)) {
    throw new Error(
      `Score table "${tableName}" names an unknown signal "${scoringSignal}".`,
    );
  }
};

const assertPointsField = ({tableName, scoringSignal, pointsField, points}) => {
  if (!Number.isFinite(points)) {
    throw new Error(
      `Score table "${tableName}" gives "${scoringSignal}" a ${pointsField} that is not a finite number.`,
    );
  }
};

export const assertScoreTable = scoreTable => {
  const {tableName, tableCitations, tableMode, signalPoints, priorityOrder} =
    scoreTable;
  if (!Array.isArray(tableCitations) || tableCitations.length === 0) {
    throw new Error(`Score table "${tableName}" has no citations.`);
  }
  if (!tableCitations.every(isCitationText)) {
    throw new Error(
      `Score table "${tableName}" has a citation that is not a non-empty string.`,
    );
  }
  if (!ScoreTableMode.values.includes(tableMode)) {
    throw new Error(
      `Score table "${tableName}" has an unknown mode "${tableMode}".`,
    );
  }
  if (!isPlainObject(signalPoints)) {
    throw new Error(`Score table "${tableName}" has no signal points object.`);
  }
  for (const [scoringSignal, tablePoints] of Object.entries(signalPoints)) {
    assertScoringSignal(tableName, scoringSignal);
    for (const pointsField of REQUIRED_POINTS_FIELDS) {
      assertPointsField({
        tableName,
        scoringSignal,
        pointsField,
        points: tablePoints[pointsField],
      });
    }
    for (const pointsField of OPTIONAL_POINTS_FIELDS) {
      if (tablePoints[pointsField] !== undefined) {
        assertPointsField({
          tableName,
          scoringSignal,
          pointsField,
          points: tablePoints[pointsField],
        });
      }
    }
  }
  if (tableMode !== ScoreTableMode.STRICT_PRIORITY) {
    return;
  }
  if (!Array.isArray(priorityOrder) || priorityOrder.length === 0) {
    throw new Error(
      `Score table "${tableName}" is strict-priority without a priority order.`,
    );
  }
  for (const scoringSignal of priorityOrder) {
    assertScoringSignal(tableName, scoringSignal);
  }
};
