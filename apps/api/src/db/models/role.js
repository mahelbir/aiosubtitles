import {DataTypes} from 'sequelize';
import {
  ROLE_LABEL_MAX_LENGTH,
  ROLE_POSITION_MAX,
  ROLE_POSITION_MIN,
  ROLE_SLUG_MAX_LENGTH,
} from '@repo/shared/constants/role.js';
import {sequelize} from '../index.js';
import {BaseModel} from '../base-model.js';
import {dbUtils} from '../utils.js';

export class Role extends BaseModel {
  static notFoundMessage = 'Rol bulunamadı.';
  static permissionsInclude = {
    association: 'permissions',
    attributes: ['permission'],
  };
}

Role.init(
  {
    id: dbUtils.uuidPrimaryKey(),
    slug: {
      type: DataTypes.STRING(ROLE_SLUG_MAX_LENGTH),
      allowNull: false,
      unique: {msg: 'Bu anahtar zaten kullanımda.'},
    },
    label: {
      type: DataTypes.STRING(ROLE_LABEL_MAX_LENGTH),
      allowNull: false,
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: ROLE_POSITION_MIN,
        max: ROLE_POSITION_MAX,
      },
    },
    isLocked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'roles',
  },
);
