import {DataTypes} from 'sequelize';
import {SUBTITLE_LANGUAGE_LIMIT_DEFAULT} from '@repo/shared/constants/user-config.js';
import {sequelize} from '../index.js';
import {BaseModel} from '../base-model.js';
import {uuidV4} from '../../lib/common.js';
import {dbUtils} from '../utils.js';
import {UserConfigCredential} from './user-config-credential.js';

export class UserConfig extends BaseModel {
  static sensitiveAttributes = ['passwordHash'];
  static credentialsInclude = {
    association: 'credentials',
    attributes: UserConfigCredential.embeddedAttributes,
  };
}

UserConfig.init(
  {
    id: dbUtils.uuidPrimaryKey(uuidV4),
    passwordHash: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    languageCodes: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
    },
    subtitleLanguageLimit: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: SUBTITLE_LANGUAGE_LIMIT_DEFAULT,
    },
    subtitleSourceSwitchStates: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    listImprovementSwitchStates: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    sequelize,
    tableName: 'user_configs',
    timestamps: true,
  },
);
