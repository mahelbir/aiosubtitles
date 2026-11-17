import {Op} from 'sequelize';
import {StatusCodes} from 'http-status-codes';
import {Role} from '../../../db/models/role.js';
import {dbUtils} from '../../../db/utils.js';

export function toUserJson(user, policy) {
  const json = dbUtils.getPlain(user);
  json.viewerCan = policy.getAbilities(json);
  return json;
}

export async function resolveRoles({roleIds, visibility}, transaction) {
  const ids = roleIds ?? [];
  if (ids.length === 0) {
    return {roles: []};
  }
  const roles = await Role.withScope('visibleTo', visibility).findAllLocked(
    {
      where: {id: {[Op.in]: ids}},
      attributes: ['id', 'position'],
      order: [['id', 'ASC']],
      raw: true,
    },
    transaction,
  );
  if (roles.length !== new Set(ids).size) {
    return {
      error: {
        message: 'Geçersiz rol seçildi.',
        statusCode: StatusCodes.BAD_REQUEST,
      },
    };
  }
  return {roles};
}
