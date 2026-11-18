import {DataTypes} from 'sequelize';
import {sequelize} from '../index.js';
import {BaseModel} from '../base-model.js';
import {dbUtils} from '../utils.js';

export class SubtitleReferenceComparison extends BaseModel {
  static familyAttributes = [
    'candidateSubtitleId',
    'referenceSubtitleId',
    'isSameTimeFamily',
  ];
  static methodAttributes = [
    'candidateSubtitleId',
    'referenceSubtitleId',
    'comparisonMethodVersion',
  ];
}

SubtitleReferenceComparison.init(
  {
    candidateSubtitleId: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    referenceSubtitleId: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    isSameTimeFamily: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    timingOffsetMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    timingFpsRatio: {
      type: DataTypes.DECIMAL,
      allowNull: true,
      defaultValue: null,
      get: dbUtils.asNumber('timingFpsRatio'),
    },
    matchedCueShare: {
      type: DataTypes.DECIMAL,
      allowNull: false,
      get: dbUtils.asNumber('matchedCueShare'),
    },
    comparisonMethodVersion: {
      type: DataTypes.SMALLINT,
      allowNull: false,
    },
    comparedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'subtitle_reference_comparisons',
  },
);
