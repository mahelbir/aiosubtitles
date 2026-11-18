import {DataTypes} from 'sequelize';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SubtitleFileExtension} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {sequelize} from '../index.js';
import {BaseModel} from '../base-model.js';
import {dbUtils} from '../utils.js';

const URL_CODE_LENGTH = 64;

const optionalBoolean = {
  type: DataTypes.BOOLEAN,
  allowNull: true,
  defaultValue: null,
};

const optionalInteger = {
  type: DataTypes.INTEGER,
  allowNull: true,
  defaultValue: null,
};

export class Subtitle extends BaseModel {}

Subtitle.init(
  {
    id: dbUtils.uuidPrimaryKey(),
    urlCode: {
      type: DataTypes.CHAR(URL_CODE_LENGTH),
      allowNull: false,
      unique: {msg: 'This subtitle url code is already in use.'},
    },
    subtitleSource: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {isIn: [SubtitleSource.values]},
    },
    siteFileId: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    archiveEntryPath: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    fileExtension: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {isIn: [SubtitleFileExtension.values]},
    },
    siteLanguageCode: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    releaseNames: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
    },
    isHearingImpaired: {...optionalBoolean},
    isForced: {...optionalBoolean},
    isMachineTranslated: {...optionalBoolean},
    isUploaderTrusted: {...optionalBoolean},
    isQuotaCostly: {...optionalBoolean},
    siteDownloadCount: {...optionalInteger},
    siteFps: {
      type: DataTypes.DECIMAL,
      allowNull: true,
      defaultValue: null,
      get: dbUtils.asNumber('siteFps'),
    },
    siteFileUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    siteCueCount: {...optionalInteger},
    siteDurationMs: {...optionalInteger},
    isSitePack: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    siteMetadataUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    firstSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'subtitles',
  },
);
