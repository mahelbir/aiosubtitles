import {groupBy, keyBy, mapValues} from 'es-toolkit';
import {Role} from '../../db/models/role.js';
import {RolePermission} from '../../db/models/role-permission.js';
import {config} from '../../config/index.js';
import {RedisCache} from '../../redis/cache.js';

export const roleCache = new RedisCache({
  prefix: 'auth:roles',
  memo: true,
  ttl: () => config.authCacheTtl,
  load: async () => {
    const [roles, grants] = await Promise.all([
      Role.findAll({raw: true}),
      RolePermission.findAll({
        attributes: ['roleId', 'permission'],
        raw: true,
      }),
    ]);
    const permissions = mapValues(
      groupBy(grants, row => row.roleId),
      entries => entries.map(row => row.permission),
    );
    return mapValues(
      keyBy(roles, role => role.id),
      role => ({...role, permissions: permissions[role.id] ?? []}),
    );
  },
});
