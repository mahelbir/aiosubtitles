import {beforeEach, describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {Permission} from '@repo/shared/constants/permission.js';
import {RolePlacement} from '@repo/shared/constants/role.js';
import {getTestApp} from '../helpers/app.js';
import {readEnvelope} from '../helpers/assertions.js';
import {BaseModel} from '../../src/db/base-model.js';
import {
  authHeaders,
  createRole,
  createUser,
  getSeededAdminRole,
  toEmail,
} from '../helpers/factories.js';

const MANAGE_PEER = Permission.USER_MANAGE_PEER;

let headers;
let world;

beforeEach(async () => {
  const actorRole = await createRole({
    slug: 'inspector',
    position: 4000,
    permissions: [Permission.ADMIN, MANAGE_PEER],
  });
  const peer = await createRole({slug: 'peer', position: 4000});
  const below = await createRole({
    slug: 'below',
    position: 2000,
    permissions: [MANAGE_PEER],
  });
  const actor = await createUser({
    email: toEmail('inspector'),
    roles: [actorRole],
  });

  headers = await authHeaders(actor);
  world = {actorRole, peer, below, locked: await getSeededAdminRole()};
});

const listRoles = async app => {
  const response = await app.inject({
    method: 'GET',
    url: '/roles?pageSize=100',
    headers,
  });
  expect(response.statusCode).toBe(StatusCodes.OK);
  return readEnvelope(response).data.items;
};

const readRole = async (app, id) => {
  const response = await app.inject({
    method: 'GET',
    url: `/roles/${id}`,
    headers,
  });
  expect(response.statusCode).toBe(StatusCodes.OK);
  return readEnvelope(response).data;
};

describe('representation', () => {
  it('keeps the list a summary — no permissions on a row', async () => {
    const app = await getTestApp();
    for (const row of await listRoles(app)) {
      expect(row).not.toHaveProperty('permissions');
      expect(row).toMatchObject({
        id: expect.any(String),
        slug: expect.any(String),
        label: expect.any(String),
        position: expect.any(Number),
        isLocked: expect.any(Boolean),
        rank: expect.any(Number),
      });
    }
  });

  it('makes the detail complete — permissions as plain strings', async () => {
    const app = await getTestApp();
    const detail = await readRole(app, world.below.id);
    expect(detail.permissions).toEqual([MANAGE_PEER]);
  });

  it('describes where the role sits, so an editor can reproduce it', async () => {
    const app = await getTestApp();
    const detail = await readRole(app, world.below.id);
    expect(detail).toMatchObject({
      anchorRoleId: expect.any(String),
      placement: expect.any(String),
      rank: expect.any(Number),
    });
  });

  it('reports a shared level as the same placement', async () => {
    const app = await getTestApp();
    const detail = await readRole(app, world.peer.id);
    expect(detail).toMatchObject({
      anchorRoleId: world.actorRole.id,
      placement: RolePlacement.SAME,
    });
  });

  it('gives roles at one level the same rank', async () => {
    const app = await getTestApp();
    const rows = await listRoles(app);
    const rankOf = slug => rows.find(row => row.slug === slug).rank;
    expect(rankOf('inspector')).toBe(rankOf('peer'));
    expect(rankOf('below')).toBeGreaterThan(rankOf('inspector'));
  });
});

describe('abilities on a role row', () => {
  it('closes a locked role to everyone', async () => {
    const app = await getTestApp();
    const row = (await listRoles(app)).find(
      entry => entry.id === world.locked.id,
    );
    expect(row.viewerCan).toMatchObject({update: false, delete: false});
  });

  it('closes a role sharing the actor level', async () => {
    const app = await getTestApp();
    const row = (await listRoles(app)).find(entry => entry.slug === 'peer');
    expect(row.viewerCan).toMatchObject({update: false, delete: false});
  });

  it('opens a role below the actor', async () => {
    const app = await getTestApp();
    const row = (await listRoles(app)).find(entry => entry.slug === 'below');
    expect(row.viewerCan).toMatchObject({update: true, delete: true});
  });

  it('matches what the guard actually answers', async () => {
    const app = await getTestApp();
    const mismatches = [];
    for (const row of await listRoles(app)) {
      const attempted = await app.inject({
        method: 'PATCH',
        url: `/roles/${row.id}`,
        headers,
        payload: {label: `probe ${row.slug}`},
      });
      const allowed = attempted.statusCode === StatusCodes.OK;
      if (allowed !== row.viewerCan.update) {
        mismatches.push(
          `${row.slug}: viewerCan.update=${row.viewerCan.update} but PATCH answered ${attempted.statusCode}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('identifiers are case-insensitive', () => {
  it('accepts an upper-cased anchor when creating', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/roles',
      headers,
      payload: {
        slug: 'anchored',
        label: 'Anchored',
        anchorRoleId: world.below.id.toUpperCase(),
        placement: RolePlacement.BELOW,
        permissions: [],
      },
    });
    expect(response.statusCode).toBe(StatusCodes.CREATED);

    const created = await readRole(app, readEnvelope(response).data.id);
    expect(created.position).toBeLessThan(world.below.position);
  });

  it('accepts an upper-cased anchor when moving by placement', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/roles/${world.below.id}`,
      headers,
      payload: {anchorRoleId: world.peer.id.toUpperCase(), placement: 'below'},
    });
    expect(response.statusCode).toBe(StatusCodes.OK);
  });

  it('refuses a role anchored on itself, however the id is cased', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/roles/${world.below.id}`,
      headers,
      payload: {anchorRoleId: world.below.id.toUpperCase()},
    });
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(readEnvelope(response).message).toContain('kendi konumuna');
  });

  it('reads a role by an upper-cased identifier', async () => {
    const app = await getTestApp();
    const detail = await readRole(app, world.below.id.toUpperCase());
    expect(detail.id).toBe(world.below.id);
  });

  it('refuses an anchor that does not exist', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/roles',
      headers,
      payload: {
        slug: 'orphan',
        label: 'Orphan',
        anchorRoleId: '018f3a2b-6c4d-7e8f-9a0b-1c2d3e4f5061',
        placement: RolePlacement.BELOW,
        permissions: [],
      },
    });
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(readEnvelope(response).message).toContain('Konum rolü');
  });
});

describe('searching the role list', () => {
  const search = async (app, term) => {
    const response = await app.inject({
      method: 'GET',
      url: `/roles?search=${encodeURIComponent(term)}`,
      headers,
    });
    expect(response.statusCode).toBe(StatusCodes.OK);
    return readEnvelope(response).data.items.map(row => row.slug);
  };

  it('treats a uuid as an identity lookup', async () => {
    const app = await getTestApp();
    expect(await search(app, world.below.id)).toEqual(['below']);
  });

  it('accepts that identity in either case', async () => {
    const app = await getTestApp();
    expect(await search(app, world.below.id.toUpperCase())).toEqual(['below']);
  });

  it('matches a slug exactly, while the label is the loose half', async () => {
    const app = await getTestApp();
    await createRole({
      slug: 'warehouse',
      label: 'Depo Sorumlusu',
      position: 750,
    });
    expect(await search(app, 'warehouse')).toEqual(['warehouse']);
    /* A prefix of the slug finds nothing: only the label is matched loosely. */
    expect(await search(app, 'wareho')).toEqual([]);
  });

  it('matches a slug typed in capitals, still exactly', async () => {
    const app = await getTestApp();
    await createRole({
      slug: 'warehouse',
      label: 'Depo Sorumlusu',
      position: 750,
    });
    expect(await search(app, 'WAREHOUSE')).toEqual(['warehouse']);
    expect(await search(app, 'WAREHO')).toEqual([]);
  });

  it('matches a label loosely, folding case by the app locale', async () => {
    const app = await getTestApp();
    await createRole({
      slug: 'labelled',
      label: 'Isparta Şube Sorumlusu',
      position: 700,
    });
    expect(await search(app, 'ısparta şube')).toEqual(['labelled']);
  });

  it('finds nothing for a uuid that belongs to no role', async () => {
    const app = await getTestApp();
    expect(await search(app, '018f3a2b-6c4d-7e8f-9a0b-1c2d3e4f5061')).toEqual(
      [],
    );
  });
});

describe('deleting a role', () => {
  const deleteRole = (app, id) =>
    app.inject({method: 'DELETE', url: `/roles/${id}`, headers});

  it('refuses a role that users still hold', async () => {
    const app = await getTestApp();
    await createUser({roles: [world.below]});
    const response = await deleteRole(app, world.below.id);
    expect(response.statusCode).toBe(StatusCodes.CONFLICT);
    expect(readEnvelope(response).message).toBe(BaseModel.foreignKeyMessage);
    expect((await readRole(app, world.below.id)).id).toBe(world.below.id);
  });

  it('deletes a role that no one holds', async () => {
    const app = await getTestApp();
    const response = await deleteRole(app, world.below.id);
    expect(response.statusCode).toBe(StatusCodes.OK);
  });
});
