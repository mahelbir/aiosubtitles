import {DataTypes} from 'sequelize';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {sequelize} from '../index.js';
import {BaseModel} from '../base-model.js';
import {dbUtils} from '../utils.js';

export class UserConfigCredential extends BaseModel {
  static notFoundMessage = 'Credential not found.';
  static sensitiveAttributes = ['credentialSecret'];
  static embeddedAttributes = [
    'id',
    'subtitleSource',
    'credentialKind',
    'credentialSecret',
    'credentialPosition',
    'credentialStatus',
    'credentialCheckedAt',
    'quotaRemainingCount',
    'quotaResetAt',
  ];
}

UserConfigCredential.init(
  {
    id: dbUtils.uuidPrimaryKey(),
    userConfigId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    subtitleSource: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {isIn: [SubtitleSource.values]},
    },
    credentialKind: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {isIn: [CredentialKind.values]},
    },
    credentialSecret: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    credentialPosition: {
      type: DataTypes.SMALLINT,
      allowNull: false,
    },
    credentialStatus: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: CredentialStatus.UNCHECKED,
      validate: {isIn: [CredentialStatus.values]},
    },
    credentialCheckedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    quotaRemainingCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    quotaResetAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    sequelize,
    tableName: 'user_config_credentials',
  },
);
