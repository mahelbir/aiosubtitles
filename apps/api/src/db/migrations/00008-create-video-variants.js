import {DataTypes} from 'sequelize';
import {IDENTIFIER_COLLATION, withCollation} from '../collation.js';
import {dbUtils} from '../utils.js';

const VIDEO_HASH_LENGTH = 16;

export const up = async ({context: queryInterface}) => {
  const identifierText = withCollation(DataTypes.TEXT, IDENTIFIER_COLLATION);
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.createTable(
      'video_variants',
      {
        id: dbUtils.uuidPrimaryKey(),
        video_id: {type: identifierText, allowNull: false},
        video_hash: {
          type: withCollation(
            DataTypes.CHAR(VIDEO_HASH_LENGTH),
            IDENTIFIER_COLLATION,
          ),
          allowNull: false,
        },
        video_size_bytes: {type: DataTypes.BIGINT, allowNull: false},
        video_filename: {
          type: identifierText,
          allowNull: true,
          defaultValue: null,
        },
        first_seen_at: {type: DataTypes.DATE, allowNull: false},
      },
      {transaction},
    );
    await queryInterface.addConstraint('video_variants', {
      type: 'unique',
      fields: ['video_id', 'video_size_bytes', 'video_hash'],
      transaction,
    });
  });
};

export const down = async ({context: queryInterface}) => {
  await queryInterface.dropTable('video_variants');
};
