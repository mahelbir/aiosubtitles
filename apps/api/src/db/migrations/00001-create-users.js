import {DataTypes} from 'sequelize';
import {dbUtils} from '../utils.js';

export const up = async ({context: queryInterface}) => {
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.createTable(
      'users',
      {
        id: dbUtils.uuidPrimaryKey(),
        email: {
          type: DataTypes.STRING(255),
          allowNull: false,
          unique: true,
        },
        password: {
          type: DataTypes.STRING(255),
          allowNull: true,
          defaultValue: null,
        },
        disabled_at: {
          type: DataTypes.DATE,
          allowNull: true,
          defaultValue: null,
        },
      },
      {transaction},
    );

    // PostgreSQL-specific
    await queryInterface.sequelize.query(
      'CREATE EXTENSION IF NOT EXISTS pg_trgm',
      {transaction},
    );
    // PostgreSQL-specific
    await queryInterface.addIndex('users', {
      fields: ['email'],
      using: 'gin',
      operator: 'gin_trgm_ops',
      transaction,
    });
  });
};

export const down = async ({context: queryInterface}) => {
  await queryInterface.dropTable('users');
};
