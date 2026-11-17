import {Role} from '../../src/db/models/role.js';
import {RolePermission} from '../../src/db/models/role-permission.js';
import {User} from '../../src/db/models/user.js';
import {hashPassword} from '../../src/lib/crypto.js';
import {generateAccessToken} from '../../src/lib/auth/token.js';
import {ADMIN_ROLE_SLUG} from '../../src/db/seeders/00001-roles.js';
import {ADMIN_EMAIL} from '../../src/db/seeders/00002-users.js';

export const DEFAULT_PASSWORD = 'test-password';
export const EMAIL_DOMAIN = 'example.com';

let sequence = 0;

function nextName(prefix) {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export function toEmail(name) {
  return `${name}@${EMAIL_DOMAIN}`;
}

export async function createRole({position, permissions = [], ...values} = {}) {
  const slug = values.slug ?? nextName('role');
  const role = await Role.create({
    slug,
    label: values.label ?? slug,
    position,
    isLocked: values.isLocked ?? false,
  });
  if (permissions.length > 0) {
    await RolePermission.bulkCreate(
      permissions.map(permission => ({roleId: role.id, permission})),
    );
  }
  return role;
}

export async function createUser({roles = [], ...values} = {}) {
  const user = await User.create({
    email: values.email ?? toEmail(nextName('user')),
    password: hashPassword(values.password ?? DEFAULT_PASSWORD),
    disabledAt: values.disabledAt ?? null,
  });
  if (roles.length > 0) {
    await user.addRoles(roles.map(role => role.id));
  }
  return user;
}

export function getSeededAdminRole() {
  return Role.findOne({where: {slug: ADMIN_ROLE_SLUG}});
}

export function getSeededAdminUser() {
  return User.findOne({where: {email: ADMIN_EMAIL}});
}

export async function authHeaders(user) {
  const {token} = await generateAccessToken(user.id);
  return {authorization: `Bearer ${token}`};
}
