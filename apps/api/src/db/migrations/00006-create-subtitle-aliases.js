import {DataTypes} from 'sequelize';
import {IDENTIFIER_COLLATION, withCollation} from '../collation.js';

export const up = async ({context: queryInterface}) => {
  const identifierText = withCollation(DataTypes.TEXT, IDENTIFIER_COLLATION);
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.createTable(
      'subtitle_aliases',
      {
        subtitle_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {model: 'subtitles', key: 'id'},
          onDelete: 'RESTRICT',
        },
        alias_source: {type: identifierText, primaryKey: true},
        alias_site_file_id: {type: identifierText, primaryKey: true},
      },
      {transaction},
    );
    await queryInterface.addIndex('subtitle_aliases', {
      fields: ['subtitle_id'],
      transaction,
    });
  });
};

export const down = async ({context: queryInterface}) => {
  await queryInterface.dropTable('subtitle_aliases');
};
