import {Op} from 'sequelize';
import {dbUtils} from '../utils.js';
import {Role} from './role.js';
import {RolePermission} from './role-permission.js';
import {User} from './user.js';
import {UserRole} from './user-role.js';

const positionInReach = maxPosition => ({[Op.lte]: maxPosition});

const highestRolePositionInReach = maxPosition =>
  dbUtils.relatedMaxAtMost(
    {
      through: UserRole,
      foreignKey: 'userId',
      otherKey: 'roleId',
      target: Role,
      attribute: 'position',
      limit: maxPosition,
    },
    User,
  );

export function applyScopes() {
  Role.addScope('withPermissions', {include: [Role.permissionsInclude]});
  Role.addScope('visibleTo', ({maxPosition}) => ({
    where: {position: positionInReach(maxPosition)},
  }));
  User.addScope('visibleTo', ({maxPosition, selfId}) => ({
    where: {
      [Op.or]: [highestRolePositionInReach(maxPosition), {id: selfId}],
    },
  }));
  User.addScope('withRoles', {
    attributes: {exclude: User.sensitiveAttributes},
    include: [User.rolesInclude],
  });
  User.addScope('withRolePermissions', {
    attributes: {exclude: User.sensitiveAttributes},
    include: [{...User.rolesInclude, include: [Role.permissionsInclude]}],
  });
}

export function applyAssociations() {
  User.belongsToMany(Role, {
    through: UserRole,
    foreignKey: 'userId',
    otherKey: 'roleId',
    as: 'roles',
  });
  Role.belongsToMany(User, {
    through: UserRole,
    foreignKey: 'roleId',
    otherKey: 'userId',
    as: 'users',
  });
  Role.hasMany(RolePermission, {
    foreignKey: 'roleId',
    as: 'permissions',
    onDelete: 'CASCADE',
  });
  RolePermission.belongsTo(Role, {foreignKey: 'roleId'});
}
