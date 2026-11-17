import {DataTypes} from 'sequelize';
import {ROLE_POSITION_STEP} from '@repo/shared/constants/role.js';

async function renumber(queryInterface, step, transaction) {
  const [rows] = await queryInterface.sequelize.query(
    'select id, position from roles order by position asc, id desc',
    {transaction},
  );
  let level = 0;
  let previous = null;
  for (const row of rows) {
    if (row.position !== previous) {
      previous = row.position;
      level += 1;
    }
    await queryInterface.sequelize.query(
      'update roles set position = :position where id = :id',
      {replacements: {position: level * step, id: row.id}, transaction},
    );
  }
}

export const up = async ({context: queryInterface}) => {
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.changeColumn(
      'roles',
      'position',
      {type: DataTypes.INTEGER, allowNull: false},
      {transaction},
    );
    await renumber(queryInterface, ROLE_POSITION_STEP, transaction);
  });
};

export const down = async ({context: queryInterface}) => {
  await queryInterface.sequelize.transaction(async transaction => {
    await renumber(queryInterface, 1, transaction);
    await queryInterface.changeColumn(
      'roles',
      'position',
      {type: DataTypes.SMALLINT, allowNull: false},
      {transaction},
    );
  });
};
