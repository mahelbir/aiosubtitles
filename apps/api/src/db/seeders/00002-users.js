import {Op} from 'sequelize';
import {hashPassword} from '../../lib/crypto.js';
import {uuidV7} from '../../lib/common.js';
import {getAdminRoleId} from './00001-roles.js';

export const ADMIN_EMAIL = 'admin@example.com';
export const ADMIN_PASSWORD = 'admin';

async function getAdminUserId(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(
    'select id from users where email = :email',
    {replacements: {email: ADMIN_EMAIL}},
  );
  return rows[0]?.id ?? null;
}

export const up = async ({context: queryInterface}) => {
  await queryInterface.bulkInsert('users', [
    {
      id: uuidV7(),
      email: ADMIN_EMAIL,
      password: hashPassword(ADMIN_PASSWORD),
      disabled_at: null,
    },
  ]);

  const [adminUserId, adminRoleId] = await Promise.all([
    getAdminUserId(queryInterface),
    getAdminRoleId(queryInterface),
  ]);
  if (adminUserId && adminRoleId) {
    await queryInterface.bulkInsert('user_roles', [
      {
        user_id: adminUserId,
        role_id: adminRoleId,
      },
    ]);
  }
};

/* Anchored on the email, not a fixed id: the seeded account may since have been
   renamed and grown real data, and a rollback must not delete what it no longer
   recognizes. */
export const down = async ({context: queryInterface}) => {
  const adminUserId = await getAdminUserId(queryInterface);
  if (!adminUserId) {
    console.warn(`SEED_DOWN: "${ADMIN_EMAIL}" not found`);
    return;
  }
  await queryInterface.bulkDelete('user_roles', {
    user_id: {[Op.in]: [adminUserId]},
  });
  await queryInterface.bulkDelete('users', {
    id: {[Op.in]: [adminUserId]},
  });
};
