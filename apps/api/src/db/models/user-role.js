import {DataTypes} from 'sequelize';
import {sequelize} from '../index.js';
import {BaseModel} from '../base-model.js';

export class UserRole extends BaseModel {}

UserRole.init(
  {
    userId: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    roleId: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
  },
  {
    sequelize,
    tableName: 'user_roles',
  },
);
