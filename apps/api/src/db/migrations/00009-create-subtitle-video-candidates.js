import {DataTypes} from 'sequelize';
import {IDENTIFIER_COLLATION, withCollation} from '../collation.js';

export const up = async ({context: queryInterface}) => {
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.createTable(
      'subtitle_video_candidates',
      {
        video_id: {
          type: withCollation(DataTypes.TEXT, IDENTIFIER_COLLATION),
          primaryKey: true,
        },
        subtitle_id: {
          type: DataTypes.UUID,
          primaryKey: true,
          references: {model: 'subtitles', key: 'id'},
          onDelete: 'RESTRICT',
        },
        candidate_first_seen_at: {type: DataTypes.DATE, allowNull: false},
        candidate_last_seen_at: {type: DataTypes.DATE, allowNull: false},
      },
      {transaction},
    );
    await queryInterface.addIndex('subtitle_video_candidates', {
      fields: ['subtitle_id'],
      transaction,
    });
  });
};

export const down = async ({context: queryInterface}) => {
  await queryInterface.dropTable('subtitle_video_candidates');
};
