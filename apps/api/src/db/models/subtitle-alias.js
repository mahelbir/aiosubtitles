import {DataTypes} from 'sequelize';
import {sequelize} from '../index.js';
import {BaseModel} from '../base-model.js';
import {SubtitleAliasSource} from '../../lib/subtitle-sources/subtitle-alias-source.js';

export class SubtitleAlias extends BaseModel {}

SubtitleAlias.init(
  {
    subtitleId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    aliasSource: {
      type: DataTypes.TEXT,
      primaryKey: true,
      validate: {isIn: [SubtitleAliasSource.values]},
    },
    aliasSiteFileId: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
  },
  {
    sequelize,
    tableName: 'subtitle_aliases',
  },
);
