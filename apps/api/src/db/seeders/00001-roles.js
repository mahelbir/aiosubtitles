import {Op} from 'sequelize';
import {Permission} from '@repo/shared/constants/permission.js';
import {ROLE_POSITION_STEP} from '@repo/shared/constants/role.js';
import {uuidV7} from '../../lib/common.js';

export const ADMIN_ROLE_SLUG = 'admin';

export async function getAdminRoleId(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(
    'select id from roles where slug = :slug',
    {replacements: {slug: ADMIN_ROLE_SLUG}},
  );
  return rows[0]?.id ?? null;
}

export const up = async ({context: queryInterface}) => {
  await queryInterface.bulkInsert('roles', [
    {
      id: uuidV7(),
      slug: ADMIN_ROLE_SLUG,
      label: 'Yönetici',
      position: ROLE_POSITION_STEP,
      is_locked: true,
    },
  ]);

  const adminRoleId = await getAdminRoleId(queryInterface);
  await queryInterface.bulkInsert(
    'role_permissions',
    Permission.values.map(permission => ({
      role_id: adminRoleId,
      permission,
    })),
  );
};

export const down = async ({context: queryInterface}) => {
  const adminRoleId = await getAdminRoleId(queryInterface);
  if (!adminRoleId) {
    return;
  }
  await queryInterface.bulkDelete('role_permissions', {
    role_id: {[Op.in]: [adminRoleId]},
  });
  await queryInterface.bulkDelete('roles', {
    id: {[Op.in]: [adminRoleId]},
  });
};
