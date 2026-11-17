import {DataTypes} from 'sequelize';
import {PERMISSION_MAX_LENGTH} from '@repo/shared/constants/permission.js';
import {
  ROLE_LABEL_MAX_LENGTH,
  ROLE_SLUG_MAX_LENGTH,
} from '@repo/shared/constants/role.js';
import {dbUtils} from '../utils.js';

export const up = async ({context: queryInterface}) => {
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.createTable(
      'roles',
      {
        id: dbUtils.uuidPrimaryKey(),
        slug: {
          type: DataTypes.STRING(ROLE_SLUG_MAX_LENGTH),
          allowNull: false,
          unique: true,
        },
        label: {
          type: DataTypes.STRING(ROLE_LABEL_MAX_LENGTH),
          allowNull: false,
        },
        position: {
          type: DataTypes.SMALLINT,
          allowNull: false,
        },
        is_locked: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
      },
      {transaction},
    );
    await queryInterface.addIndex('roles', ['position'], {transaction});

    await queryInterface.createTable(
      'role_permissions',
      {
        role_id: {
          type: DataTypes.UUID,
          primaryKey: true,
          references: {model: 'roles', key: 'id'},
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        permission: {
          type: DataTypes.STRING(PERMISSION_MAX_LENGTH),
          primaryKey: true,
        },
      },
      {transaction},
    );

    await queryInterface.createTable(
      'user_roles',
      {
        user_id: {
          type: DataTypes.UUID,
          primaryKey: true,
          references: {model: 'users', key: 'id'},
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        role_id: {
          type: DataTypes.UUID,
          primaryKey: true,
          references: {model: 'roles', key: 'id'},
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
        },
      },
      {transaction},
    );
    await queryInterface.addIndex('user_roles', ['role_id'], {transaction});
  });
};

export const down = async ({context: queryInterface}) => {
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.dropTable('user_roles', {transaction});
    await queryInterface.dropTable('role_permissions', {transaction});
    await queryInterface.dropTable('roles', {transaction});
  });
};
