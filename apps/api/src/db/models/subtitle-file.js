import {difference} from 'es-toolkit';
import {Enum} from 'enum-plus';
import {DataTypes} from 'sequelize';
import {
  SubtitleFileFormat,
  SubtitleFileInvalidReason,
} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {sequelize} from '../index.js';
import {BaseModel} from '../base-model.js';
import {dbUtils} from '../utils.js';

const CONTENT_KEY_LENGTH = 64;

export const SubtitleFileOrigin = Enum({
  DIRECT: {value: 'direct'},
  USER_CREDENTIAL: {value: 'user-credential'},
  OPENSUBTITLES_V3: {value: 'opensubtitles-v3'},
  WYZIE: {value: 'wyzie'},
});

export class SubtitleFile extends BaseModel {
  static embeddedAttributes = [
    'subtitleId',
    'fileContent',
    'fileFormat',
    'fileEncoding',
    'cueCount',
    'fileInvalidReasons',
  ];
}

SubtitleFile.init(
  {
    subtitleId: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    fileContent: {
      type: DataTypes.BLOB,
      allowNull: false,
    },
    fileFormat: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {isIn: [SubtitleFileFormat.values]},
    },
    fileEncoding: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    fileSizeBytes: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    contentKey: {
      type: DataTypes.CHAR(CONTENT_KEY_LENGTH),
      allowNull: false,
    },
    fileFetchedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    fileOrigin: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {isIn: [SubtitleFileOrigin.values]},
    },
    detectedLanguageCode: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    cueCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    lastCueEndMs: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    fileFps: {
      type: DataTypes.DECIMAL,
      allowNull: true,
      defaultValue: null,
      get: dbUtils.asNumber('fileFps'),
    },
    isFileValid: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    fileInvalidReasons: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
      validate: {
        isEachInvalidReason(reasons) {
          if (difference(reasons, SubtitleFileInvalidReason.values).length) {
            throw new Error('Unknown subtitle file invalid reason.');
          }
        },
      },
    },
  },
  {
    sequelize,
    tableName: 'subtitle_files',
  },
);
