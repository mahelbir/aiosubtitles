import {beforeEach, describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {Permission} from '@repo/shared/constants/permission.js';
import {getTestApp} from '../helpers/app.js';
import {
  authHeaders,
  createRole,
  createUser,
  toEmail,
} from '../helpers/factories.js';
import {RolePermission} from '../../src/db/models/role-permission.js';
import {UserRole} from '../../src/db/models/user-role.js';

const ADMIN = Permission.ADMIN;
const MANAGE_PEER = Permission.USER_MANAGE_PEER;

let world;

beforeEach(async () => {
  const actorRole = await createRole({
    slug: 'actor',
    position: 4000,
    permissions: [ADMIN],
  });
  /* Below the actor, so the user holding it is manageable — but carrying a
     permission the actor cannot grant, so the role itself is not assignable.
     That separation is what makes an unchanged resubmission meaningful. */
  const restricted = await createRole({
    slug: 'restricted',
    position: 1500,
    permissions: [MANAGE_PEER],
  });
  const plain = await createRole({slug: 'plain', position: 1400});

  const actor = await createUser({email: toEmail('actor'), roles: [actorRole]});
  const subject = await createUser({
    email: toEmail('subject'),
    roles: [restricted],
  });

  world = {
    headers: await authHeaders(actor),
    restricted,
    plain,
    subject,
  };
});

const roleIdsOf = async userId =>
  (
    await UserRole.findAll({
      where: {userId},
      attributes: ['roleId'],
      raw: true,
    })
  )
    .map(row => row.roleId)
    .toSorted();

const permissionsOf = async roleId =>
  (
    await RolePermission.findAll({
      where: {roleId},
      attributes: ['permission'],
      raw: true,
    })
  )
    .map(row => row.permission)
    .toSorted();

describe('an omitted field is left alone', () => {
  it('keeps a user roles when the update does not mention them', async () => {
    const app = await getTestApp();
    const before = await roleIdsOf(world.subject.id);

    const response = await app.inject({
      method: 'PATCH',
      url: `/users/${world.subject.id}`,
      headers: world.headers,
      payload: {email: toEmail('renamed-subject')},
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(await roleIdsOf(world.subject.id)).toEqual(before);
  });

  it('keeps a role permissions when the update does not mention them', async () => {
    const app = await getTestApp();
    const before = await permissionsOf(world.restricted.id);

    const response = await app.inject({
      method: 'PATCH',
      url: `/roles/${world.restricted.id}`,
      headers: world.headers,
      payload: {label: 'Renamed'},
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(await permissionsOf(world.restricted.id)).toEqual(before);
  });
});

describe('a difference the actor cannot make', () => {
  it('allows resubmitting an unheld permission unchanged', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/roles/${world.restricted.id}`,
      headers: world.headers,
      payload: {label: 'Kept', permissions: [MANAGE_PEER]},
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(await permissionsOf(world.restricted.id)).toEqual([MANAGE_PEER]);
  });

  it('refuses removing an unheld permission', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/roles/${world.restricted.id}`,
      headers: world.headers,
      payload: {permissions: []},
    });

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN);
    expect(await permissionsOf(world.restricted.id)).toEqual([MANAGE_PEER]);
  });

  it('refuses adding an unheld permission', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/roles/${world.plain.id}`,
      headers: world.headers,
      payload: {permissions: [MANAGE_PEER]},
    });

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN);
    expect(await permissionsOf(world.plain.id)).toEqual([]);
  });

  it('allows resubmitting an unassignable role unchanged', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/users/${world.subject.id}`,
      headers: world.headers,
      payload: {roleIds: [world.restricted.id]},
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(await roleIdsOf(world.subject.id)).toEqual([world.restricted.id]);
  });

  it('refuses removing an unassignable role', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/users/${world.subject.id}`,
      headers: world.headers,
      payload: {roleIds: []},
    });

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN);
  });

  it('leaves the assignment intact after the refusal, not half-applied', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'PATCH',
      url: `/users/${world.subject.id}`,
      headers: world.headers,
      payload: {email: toEmail('half-applied'), roleIds: []},
    });

    expect(await roleIdsOf(world.subject.id)).toEqual([world.restricted.id]);
    const reread = await app.inject({
      method: 'GET',
      url: `/users/${world.subject.id}`,
      headers: world.headers,
    });
    expect(JSON.parse(reread.body).data.email).toBe(toEmail('subject'));
  });
});
