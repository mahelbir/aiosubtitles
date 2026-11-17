import {Op} from 'sequelize';
import {Permission} from '@repo/shared/constants/permission.js';
import {redis} from '../../redis/index.js';
import {roleCache} from '../../lib/auth/role-cache.js';
import {Role} from '../models/role.js';
import {RolePermission} from '../models/role-permission.js';
import {initializeDatabase} from '../init.js';
import {ADMIN_ROLE_SLUG} from '../seeders/00001-roles.js';
import {dbCli} from './runner.js';

{
  redis.on('error', () => {});
  initializeDatabase({cacheHooks: false});
}

await dbCli.run(
  async () => {
    await deleteStalePermissions();
    await createMissingPermissions();
  },
  {
    cleanup: async () => {
      await dbCli.dropCaches([() => roleCache.invalidate()]);
      redis.disconnect();
    },
  },
);

async function deleteStalePermissions() {
  const deleted = await RolePermission.destroy({
    where: {permission: {[Op.notIn]: Permission.values}},
  });
  if (deleted > 0) {
    dbCli.log.info({count: deleted}, 'Stale permissions removed');
  }
}

async function createMissingPermissions() {
  const adminRole = await Role.findOne({
    where: {slug: ADMIN_ROLE_SLUG},
    attributes: ['id'],
    raw: true,
  });
  if (adminRole) {
    const existing = await RolePermission.findAll({
      where: {roleId: adminRole.id},
      attributes: ['permission'],
      raw: true,
    });
    const known = new Set(existing.map(row => row.permission));
    const missing = Permission.values
      .filter(permission => !known.has(permission))
      .map(permission => ({roleId: adminRole.id, permission}));

    if (missing.length > 0) {
      await RolePermission.bulkCreate(missing);
      dbCli.log.info(
        {count: missing.length, role: ADMIN_ROLE_SLUG},
        'Missing permissions granted',
      );
    }
  }
}
