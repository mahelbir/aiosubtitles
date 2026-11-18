import {DataTypes} from 'sequelize';
import {sequelize} from '../index.js';
import {BaseModel} from '../base-model.js';

export class SubtitleVideoCandidate extends BaseModel {}

SubtitleVideoCandidate.init(
  {
    videoId: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    subtitleId: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    candidateFirstSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    candidateLastSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'subtitle_video_candidates',
  },
);
