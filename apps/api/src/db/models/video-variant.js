import {DataTypes} from 'sequelize';
import {sequelize} from '../index.js';
import {BaseModel} from '../base-model.js';
import {dbUtils} from '../utils.js';

export const VIDEO_HASH_LENGTH = 16;

export class VideoVariant extends BaseModel {}

VideoVariant.init(
  {
    id: dbUtils.uuidPrimaryKey(),
    videoId: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    videoHash: {
      type: DataTypes.CHAR(VIDEO_HASH_LENGTH),
      allowNull: false,
    },
    videoSizeBytes: {
      type: DataTypes.BIGINT,
      allowNull: false,
      get: dbUtils.asNumber('videoSizeBytes'),
    },
    videoFilename: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    firstSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'video_variants',
  },
);
