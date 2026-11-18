import {DataTypes} from 'sequelize';
import {IDENTIFIER_COLLATION, withCollation} from '../collation.js';

const CONTENT_KEY_LENGTH = 64;

export const up = async ({context: queryInterface}) => {
  const identifierText = withCollation(DataTypes.TEXT, IDENTIFIER_COLLATION);
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.createTable(
      'subtitle_files',
      {
        subtitle_id: {
          type: DataTypes.UUID,
          primaryKey: true,
          references: {model: 'subtitles', key: 'id'},
          onDelete: 'RESTRICT',
        },
        file_content: {type: DataTypes.BLOB, allowNull: false},
        file_format: {type: identifierText, allowNull: false},
        file_encoding: {type: identifierText, allowNull: false},
        file_size_bytes: {type: DataTypes.INTEGER, allowNull: false},
        content_key: {
          type: withCollation(
            DataTypes.CHAR(CONTENT_KEY_LENGTH),
            IDENTIFIER_COLLATION,
          ),
          allowNull: false,
        },
        file_fetched_at: {type: DataTypes.DATE, allowNull: false},
        file_origin: {type: identifierText, allowNull: false},
        detected_language_code: {
          type: identifierText,
          allowNull: true,
          defaultValue: null,
        },
        cue_count: {type: DataTypes.INTEGER, allowNull: false},
        last_cue_end_ms: {type: DataTypes.INTEGER, allowNull: false},
        file_fps: {
          type: DataTypes.DECIMAL,
          allowNull: true,
          defaultValue: null,
        },
        is_file_valid: {type: DataTypes.BOOLEAN, allowNull: false},
        file_invalid_reasons: {
          type: withCollation(
            DataTypes.ARRAY(DataTypes.TEXT),
            IDENTIFIER_COLLATION,
          ),
          allowNull: false,
          defaultValue: queryInterface.sequelize.literal(`'{}'`),
        },
      },
      {transaction},
    );
    await queryInterface.addIndex('subtitle_files', {
      fields: ['content_key'],
      transaction,
    });
  });
};

export const down = async ({context: queryInterface}) => {
  await queryInterface.dropTable('subtitle_files');
};
