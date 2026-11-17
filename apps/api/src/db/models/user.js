import {DataTypes} from 'sequelize';
import {sequelize} from '../index.js';
import {BaseModel} from '../base-model.js';
import {dbUtils} from '../utils.js';

export class User extends BaseModel {
  static notFoundMessage = 'Kullanıcı bulunamadı.';
  static sensitiveAttributes = ['password'];
  static rolesInclude = {
    association: 'roles',
    attributes: ['id', 'label', 'position'],
    through: {attributes: []},
  };
}

User.init(
  {
    id: dbUtils.uuidPrimaryKey(),
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: {msg: 'Bu e-posta zaten kullanımda.'},
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
    },
    disabledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    sequelize,
    tableName: 'users',
  },
);
