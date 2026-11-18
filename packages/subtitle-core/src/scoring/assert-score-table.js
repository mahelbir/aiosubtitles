import {isPlainObject} from 'es-toolkit';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
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

const ORDER_FIELDS = Object.freeze([
  Object.freeze({
    tableMode: ScoreTableMode.STRICT_PRIORITY,
    orderField: 'priorityOrder',
    canBeEmpty: false,
  }),
  Object.freeze({
    tableMode: ScoreTableMode.TIERED,
    orderField: 'tierOrder',
    canBeEmpty: true,
  }),
]);

const assertScoringSignal = ({tableName, tableField, scoringSignal}) => {
  if (!ScoringSignal.values.includes(scoringSignal)) {
    throw new Error(
      `Score table "${tableName}" names an unknown signal "${scoringSignal}" in ${tableField}.`,
    );
  }
};

const assertPointsField = ({
  tableName,
  tableField,
  scoringSignal,
  pointsField,
  points,
}) => {
  if (!Number.isFinite(points)) {
    throw new Error(
      `Score table "${tableName}" gives "${scoringSignal}" in ${tableField} a ${pointsField} that is not a finite number.`,
    );
  }
};

const assertSubtitleSourcePoints = (tableName, subtitleSourcePoints) => {
  if (!isPlainObject(subtitleSourcePoints)) {
    throw new Error(
      `Score table "${tableName}" has subtitle source points that are not an object.`,
    );
  }
  for (const [subtitleSource, subtitleSourceWeight] of Object.entries(
    subtitleSourcePoints,
  )) {
    if (!SubtitleSource.values.includes(subtitleSource)) {
      throw new Error(
        `Score table "${tableName}" gives points to an unknown subtitle source "${subtitleSource}".`,
      );
    }
    if (!Number.isFinite(subtitleSourceWeight)) {
      throw new Error(
        `Score table "${tableName}" gives "${subtitleSource}" points that are not a finite number.`,
      );
    }
  }
};

const assertSignalPoints = ({tableName, tableField, signalPoints}) => {
  if (!isPlainObject(signalPoints)) {
    throw new Error(`Score table "${tableName}" has no ${tableField} object.`);
  }
  for (const [scoringSignal, tablePoints] of Object.entries(signalPoints)) {
    assertScoringSignal({tableName, tableField, scoringSignal});
    for (const pointsField of [
      ...REQUIRED_POINTS_FIELDS,
      ...OPTIONAL_POINTS_FIELDS.filter(
        optionalField => tablePoints[optionalField] !== undefined,
      ),
    ]) {
      assertPointsField({
        tableName,
        tableField,
        scoringSignal,
        pointsField,
        points: tablePoints[pointsField],
      });
    }
  }
};

const assertSignalOrder = ({
  scoreTable,
  orderField,
  canBeEmpty,
  scoredSignals,
}) => {
  const {tableName, tableMode} = scoreTable;
  const signalOrder = scoreTable[orderField];
  if (
    !Array.isArray(signalOrder) ||
    (!canBeEmpty && signalOrder.length === 0)
  ) {
    throw new Error(
      `Score table "${tableName}" is ${tableMode} without a ${orderField}.`,
    );
  }
  for (const scoringSignal of signalOrder) {
    assertScoringSignal({tableName, tableField: orderField, scoringSignal});
    if (!scoredSignals.has(scoringSignal)) {
      throw new Error(
        `Score table "${tableName}" lists "${scoringSignal}" in ${orderField} without a points entry.`,
      );
    }
  }
};

const assertOrderFields = scoreTable => {
  const scoredSignals = new Set([
    ...Object.keys(scoreTable.signalPoints),
    ...Object.keys(scoreTable.episodeSignalPoints ?? {}),
  ]);
  for (const {tableMode, orderField, canBeEmpty} of ORDER_FIELDS) {
    if (tableMode === scoreTable.tableMode) {
      assertSignalOrder({scoreTable, orderField, canBeEmpty, scoredSignals});
    } else if (scoreTable[orderField] !== undefined) {
      throw new Error(
        `Score table "${scoreTable.tableName}" sets a ${orderField} without being ${tableMode}.`,
      );
    }
  }
};

const assertScoreBucketSize = ({tableName, tableMode, scoreBucketSize}) => {
  if (tableMode !== ScoreTableMode.TIERED) {
    throw new Error(
      `Score table "${tableName}" sets a score bucket size without being tiered.`,
    );
  }
  if (!Number.isFinite(scoreBucketSize) || scoreBucketSize <= 0) {
    throw new Error(
      `Score table "${tableName}" has a score bucket size that is not a positive finite number.`,
    );
  }
};

export const assertScoreTable = scoreTable => {
  const {
    tableName,
    tableCitations,
    tableMode,
    signalPoints,
    episodeSignalPoints,
    scoreBucketSize,
    subtitleSourcePoints,
  } = scoreTable;
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
  assertSignalPoints({tableName, tableField: 'signalPoints', signalPoints});
  if (episodeSignalPoints !== undefined) {
    assertSignalPoints({
      tableName,
      tableField: 'episodeSignalPoints',
      signalPoints: episodeSignalPoints,
    });
  }
  if (subtitleSourcePoints !== undefined) {
    assertSubtitleSourcePoints(tableName, subtitleSourcePoints);
  }
  if (scoreBucketSize !== undefined) {
    assertScoreBucketSize({tableName, tableMode, scoreBucketSize});
  }
  assertOrderFields(scoreTable);
};
