import {DataTypes} from 'sequelize';
import {IDENTIFIER_COLLATION, withCollation} from '../collation.js';

export const up = async ({context: queryInterface}) => {
  const identifierText = withCollation(DataTypes.TEXT, IDENTIFIER_COLLATION);
  await queryInterface.createTable('subtitle_video_bindings', {
    subtitle_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      references: {model: 'subtitles', key: 'id'},
      onDelete: 'RESTRICT',
    },
    video_id: {type: identifierText, primaryKey: true},
    bound_archive_entry_path: {type: identifierText, allowNull: false},
    bound_at: {type: DataTypes.DATE, allowNull: false},
  });
};

export const down = async ({context: queryInterface}) => {
  await queryInterface.dropTable('subtitle_video_bindings');
};
