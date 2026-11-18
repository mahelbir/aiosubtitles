import {DataTypes} from 'sequelize';
import {IDENTIFIER_COLLATION, withCollation} from '../collation.js';
import {dbUtils} from '../utils.js';

export const up = async ({context: queryInterface}) => {
  await queryInterface.createTable('user_configs', {
    id: dbUtils.uuidPrimaryKey(),
    password_hash: {
      type: withCollation(DataTypes.TEXT, IDENTIFIER_COLLATION),
      allowNull: false,
    },
    language_codes: {
      type: withCollation(
        DataTypes.ARRAY(DataTypes.TEXT),
        IDENTIFIER_COLLATION,
      ),
      allowNull: false,
    },
    subtitle_language_limit: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 10,
    },
    subtitle_source_switch_states: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: queryInterface.sequelize.fn('now'),
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: queryInterface.sequelize.fn('now'),
    },
  });
};

export const down = async ({context: queryInterface}) => {
  await queryInterface.sequelize.transaction(async transaction => {
    await dbUtils.refuseRollbackIf(
      {
        query: 'SELECT 1 FROM user_configs',
        reason: 'hold a user configuration',
        transaction,
      },
      queryInterface,
    );
    await queryInterface.dropTable('user_configs', {transaction});
  });
};
