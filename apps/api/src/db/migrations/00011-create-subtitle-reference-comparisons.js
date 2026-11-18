import {DataTypes} from 'sequelize';

export const up = async ({context: queryInterface}) => {
  const subtitleReference = () => ({
    type: DataTypes.UUID,
    primaryKey: true,
    references: {model: 'subtitles', key: 'id'},
    onDelete: 'RESTRICT',
  });
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.createTable(
      'subtitle_reference_comparisons',
      {
        candidate_subtitle_id: subtitleReference(),
        reference_subtitle_id: subtitleReference(),
        is_same_time_family: {type: DataTypes.BOOLEAN, allowNull: false},
        timing_offset_ms: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: null,
        },
        timing_fps_ratio: {
          type: DataTypes.DECIMAL,
          allowNull: true,
          defaultValue: null,
        },
        matched_cue_share: {type: DataTypes.DECIMAL, allowNull: false},
        comparison_method_version: {
          type: DataTypes.SMALLINT,
          allowNull: false,
        },
        compared_at: {type: DataTypes.DATE, allowNull: false},
      },
      {transaction},
    );
    await queryInterface.addIndex('subtitle_reference_comparisons', {
      fields: ['reference_subtitle_id'],
      transaction,
    });
  });
};

export const down = async ({context: queryInterface}) => {
  await queryInterface.dropTable('subtitle_reference_comparisons');
};
