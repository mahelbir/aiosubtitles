import {DataTypes} from 'sequelize';
import {
  Permission,
  PERMISSION_MAX_LENGTH,
} from '@repo/shared/constants/permission.js';
import {sequelize} from '../index.js';
import {BaseModel} from '../base-model.js';

export class RolePermission extends BaseModel {}

RolePermission.init(
  {
    roleId: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    permission: {
      type: DataTypes.STRING(PERMISSION_MAX_LENGTH),
      primaryKey: true,
      validate: {
        isIn: [Permission.values],
      },
    },
  },
  {
    sequelize,
    tableName: 'role_permissions',
  },
);
