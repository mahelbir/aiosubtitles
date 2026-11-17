import {describe, expect, it} from 'vitest';
import {Permission} from '@repo/shared/constants/permission.js';
import {sequelize} from '../../src/db/index.js';
import {RolePermission} from '../../src/db/models/role-permission.js';
import * as roleSeeder from '../../src/db/seeders/00001-roles.js';
import * as userSeeder from '../../src/db/seeders/00002-users.js';
import {roleCache} from '../../src/lib/auth/role-cache.js';
import {readPastMemoWindow} from '../helpers/cache.js';
import {getClosedPort, LOOPBACK, runCliScript} from '../helpers/cli.js';
import {createRole, getSeededAdminRole} from '../helpers/factories.js';

const SYNC_URL = new URL('../../src/db/cli/sync.js', import.meta.url);
const RETIRED_PERMISSION = 'retired:permission';
const ROLE_POSITION = 500;
const EVERY_PERMISSION = Permission.values.toSorted();

async function getGrants(roleId) {
  const rows = await RolePermission.findAll({
    where: {roleId},
    attributes: ['permission'],
    raw: true,
  });
  return rows.map(row => row.permission).toSorted();
}

describe('permission sync', () => {
  it('removes every grant of a permission that no longer exists', async () => {
    const [admin, role] = await Promise.all([
      getSeededAdminRole(),
      createRole({position: ROLE_POSITION}),
    ]);
    await RolePermission.bulkCreate(
      [admin, role].map(({id}) => ({
        roleId: id,
        permission: RETIRED_PERMISSION,
      })),
    );

    const {exitCode, logs} = await runCliScript(SYNC_URL);

    expect(exitCode).toBe(0);
    expect(logs).toContainEqual(
      expect.objectContaining({msg: 'Stale permissions removed', count: 2}),
    );
    const [adminGrants, roleGrants] = await Promise.all([
      getGrants(admin.id),
      getGrants(role.id),
    ]);
    expect(adminGrants).toEqual(EVERY_PERMISSION);
    expect(roleGrants).toEqual([]);
  });

  it('grants the admin role only the permissions it lacks', async () => {
    const admin = await getSeededAdminRole();
    await RolePermission.destroy({
      where: {roleId: admin.id, permission: Permission.ADMIN},
    });

    const {exitCode, logs} = await runCliScript(SYNC_URL);

    expect(exitCode).toBe(0);
    expect(logs).toContainEqual(
      expect.objectContaining({msg: 'Missing permissions granted', count: 1}),
    );
    expect(await getGrants(admin.id)).toEqual(EVERY_PERMISSION);
  });

  it('leaves the grants of every other role alone', async () => {
    const role = await createRole({
      position: ROLE_POSITION,
      permissions: [Permission.ADMIN],
    });

    const {exitCode} = await runCliScript(SYNC_URL);

    expect(exitCode).toBe(0);
    expect(await getGrants(role.id)).toEqual([Permission.ADMIN]);
  });

  it('changes nothing on a database already in sync', async () => {
    const {exitCode, messages} = await runCliScript(SYNC_URL);

    expect(exitCode).toBe(0);
    expect(messages).not.toContain('Stale permissions removed');
    expect(messages).not.toContain('Missing permissions granted');
  });

  it('grants nothing while there is no admin role', async () => {
    const context = sequelize.getQueryInterface();
    await userSeeder.down({context});
    await roleSeeder.down({context});

    const {exitCode, messages} = await runCliScript(SYNC_URL);

    expect(exitCode).toBe(0);
    expect(messages).not.toContain('Missing permissions granted');
    expect(await RolePermission.count()).toBe(0);
  });

  it('drops the cached role map it reconciled', async () => {
    const admin = await getSeededAdminRole();
    await RolePermission.destroy({
      where: {roleId: admin.id, permission: Permission.ADMIN},
      hooks: false,
    });
    await roleCache.get();

    await runCliScript(SYNC_URL);

    const roles = await readPastMemoWindow(() => roleCache.get());
    expect(roles[admin.id].permissions).toContain(Permission.ADMIN);
  });

  it('still reconciles while Redis is unreachable', async () => {
    const admin = await getSeededAdminRole();
    await RolePermission.destroy({where: {roleId: admin.id}});

    const {exitCode, messages} = await runCliScript(SYNC_URL, {
      env: {REDIS_HOST: LOOPBACK, REDIS_PORT: await getClosedPort()},
    });

    expect(exitCode).toBe(0);
    expect(messages).toContain('Redis unreachable, cache not dropped');
    expect(await getGrants(admin.id)).toEqual(EVERY_PERMISSION);
  });
});
