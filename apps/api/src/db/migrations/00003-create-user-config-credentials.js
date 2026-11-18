import {DataTypes} from 'sequelize';
import {IDENTIFIER_COLLATION, withCollation} from '../collation.js';
import {dbUtils} from '../utils.js';

export const up = async ({context: queryInterface}) => {
  const identifierText = withCollation(DataTypes.TEXT, IDENTIFIER_COLLATION);
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.createTable(
      'user_config_credentials',
      {
        id: dbUtils.uuidPrimaryKey(),
        user_config_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {model: 'user_configs', key: 'id'},
          onDelete: 'CASCADE',
        },
        subtitle_source: {type: identifierText, allowNull: false},
        credential_kind: {type: identifierText, allowNull: false},
        credential_secret: {type: identifierText, allowNull: false},
        credential_position: {type: DataTypes.SMALLINT, allowNull: false},
        credential_status: {
          type: identifierText,
          allowNull: false,
          defaultValue: 'unchecked',
        },
        credential_checked_at: {
          type: DataTypes.DATE,
          allowNull: true,
          defaultValue: null,
        },
        quota_remaining_count: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: null,
        },
        quota_reset_at: {
          type: DataTypes.DATE,
          allowNull: true,
          defaultValue: null,
        },
      },
      {transaction},
    );
    await queryInterface.addIndex('user_config_credentials', {
      name: 'user_config_credentials_position_index',
      fields: ['user_config_id', 'subtitle_source', 'credential_position'],
      transaction,
    });
  });
};

export const down = async ({context: queryInterface}) => {
  await queryInterface.sequelize.transaction(async transaction => {
    await dbUtils.refuseRollbackIf(
      {
        query: 'SELECT 1 FROM user_config_credentials',
        reason: 'hold a user credential',
        transaction,
      },
      queryInterface,
    );
    await queryInterface.dropTable('user_config_credentials', {transaction});
  });
};
