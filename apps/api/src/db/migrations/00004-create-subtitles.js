import {DataTypes} from 'sequelize';
import {IDENTIFIER_COLLATION, withCollation} from '../collation.js';
import {dbUtils} from '../utils.js';

const URL_CODE_LENGTH = 64;

export const up = async ({context: queryInterface}) => {
  const identifierText = withCollation(DataTypes.TEXT, IDENTIFIER_COLLATION);
  const optionalBoolean = () => ({
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: null,
  });
  const optionalInteger = () => ({
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
  });
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.createTable(
      'subtitles',
      {
        id: dbUtils.uuidPrimaryKey(),
        url_code: {
          type: withCollation(
            DataTypes.CHAR(URL_CODE_LENGTH),
            IDENTIFIER_COLLATION,
          ),
          allowNull: false,
          unique: true,
        },
        subtitle_source: {type: identifierText, allowNull: false},
        site_file_id: {type: identifierText, allowNull: false},
        archive_entry_path: {
          type: identifierText,
          allowNull: false,
          defaultValue: '',
        },
        file_extension: {type: identifierText, allowNull: false},
        site_language_code: {type: identifierText, allowNull: false},
        release_names: {
          type: withCollation(
            DataTypes.ARRAY(DataTypes.TEXT),
            IDENTIFIER_COLLATION,
          ),
          allowNull: false,
          defaultValue: queryInterface.sequelize.literal(`'{}'`),
        },
        is_hearing_impaired: optionalBoolean(),
        is_forced: optionalBoolean(),
        is_machine_translated: optionalBoolean(),
        is_uploader_trusted: optionalBoolean(),
        is_quota_costly: optionalBoolean(),
        site_download_count: optionalInteger(),
        site_fps: {
          type: DataTypes.DECIMAL,
          allowNull: true,
          defaultValue: null,
        },
        site_file_url: {
          type: identifierText,
          allowNull: true,
          defaultValue: null,
        },
        site_cue_count: optionalInteger(),
        site_duration_ms: optionalInteger(),
        is_site_pack: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        site_metadata_updated_at: {type: DataTypes.DATE, allowNull: false},
        first_seen_at: {type: DataTypes.DATE, allowNull: false},
      },
      {transaction},
    );
    await queryInterface.addConstraint('subtitles', {
      type: 'unique',
      fields: ['subtitle_source', 'site_file_id', 'archive_entry_path'],
      transaction,
    });
  });
};

export const down = async ({context: queryInterface}) => {
  await queryInterface.dropTable('subtitles');
};
