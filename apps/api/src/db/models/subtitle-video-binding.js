import {DataTypes} from 'sequelize';
import {sequelize} from '../index.js';
import {BaseModel} from '../base-model.js';

export class SubtitleVideoBinding extends BaseModel {}

SubtitleVideoBinding.init(
  {
    subtitleId: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    videoId: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    boundArchiveEntryPath: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    boundAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'subtitle_video_bindings',
  },
);
