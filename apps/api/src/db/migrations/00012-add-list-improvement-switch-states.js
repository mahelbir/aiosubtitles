import {DataTypes} from 'sequelize';
import {dbUtils} from '../utils.js';

export const up = async ({context: queryInterface}) => {
  await queryInterface.addColumn(
    'user_configs',
    'list_improvement_switch_states',
    {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  );
};

export const down = async ({context: queryInterface}) => {
  await queryInterface.sequelize.transaction(async transaction => {
    await dbUtils.refuseRollbackIf(
      {
        query:
          "SELECT 1 FROM user_configs WHERE list_improvement_switch_states <> '{}'::jsonb",
        reason: 'hold a list improvement switch state',
        transaction,
      },
      queryInterface,
    );
    await queryInterface.removeColumn(
      'user_configs',
      'list_improvement_switch_states',
      {transaction},
    );
  });
};
