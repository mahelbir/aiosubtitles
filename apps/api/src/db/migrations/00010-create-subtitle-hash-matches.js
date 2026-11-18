import {DataTypes} from 'sequelize';
import {IDENTIFIER_COLLATION, withCollation} from '../collation.js';

const VIDEO_HASH_LENGTH = 16;

export const up = async ({context: queryInterface}) => {
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.createTable(
      'subtitle_hash_matches',
      {
        subtitle_id: {
          type: DataTypes.UUID,
          primaryKey: true,
          references: {model: 'subtitles', key: 'id'},
          onDelete: 'RESTRICT',
        },
        video_hash: {
          type: withCollation(
            DataTypes.CHAR(VIDEO_HASH_LENGTH),
            IDENTIFIER_COLLATION,
          ),
          primaryKey: true,
        },
        match_seen_at: {type: DataTypes.DATE, allowNull: false},
      },
      {transaction},
    );
    await queryInterface.addIndex('subtitle_hash_matches', {
      fields: ['video_hash'],
      transaction,
    });
  });
};

export const down = async ({context: queryInterface}) => {
  await queryInterface.dropTable('subtitle_hash_matches');
};
