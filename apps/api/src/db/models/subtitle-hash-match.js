import {DataTypes} from 'sequelize';
import {sequelize} from '../index.js';
import {BaseModel} from '../base-model.js';
import {VIDEO_HASH_LENGTH} from './video-variant.js';

export class SubtitleHashMatch extends BaseModel {}

SubtitleHashMatch.init(
  {
    subtitleId: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    videoHash: {
      type: DataTypes.CHAR(VIDEO_HASH_LENGTH),
      primaryKey: true,
    },
    matchSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'subtitle_hash_matches',
  },
);
