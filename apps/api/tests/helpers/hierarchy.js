import {Permission} from '@repo/shared/constants/permission.js';
import {authHeaders, createRole, createUser, toEmail} from './factories.js';

const ADMIN = Permission.ADMIN;
const MANAGE_PEER = Permission.USER_MANAGE_PEER;

/* A four-tier hierarchy above the seeded administrator, so every comparison the
   policy makes — above, same, below, locked — has a subject to make it against. */
export const TIERS = {
  boss: {position: 5000, permissions: [ADMIN, MANAGE_PEER]},
  manager: {position: 4000, permissions: [ADMIN]},
  staff: {position: 3000, permissions: [ADMIN]},
  intern: {position: 2000, permissions: []},
};

export async function createHierarchy() {
  const roles = {};
  for (const [name, spec] of Object.entries(TIERS)) {
    roles[name] = await createRole({slug: name, ...spec});
  }
  const users = {};
  for (const name of Object.keys(TIERS)) {
    users[name] = await createUser({
      email: toEmail(`${name}-user`),
      roles: [roles[name]],
    });
  }
  const headers = {};
  for (const name of Object.keys(TIERS)) {
    headers[name] = await authHeaders(users[name]);
  }
  return {roles, users, headers};
}
