import {beforeEach, describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {RolePlacement} from '@repo/shared/constants/role.js';
import {getRegisteredRoutes, getTestApp} from '../helpers/app.js';
import {readEnvelope, routeCalls} from '../helpers/assertions.js';
import {Role} from '../../src/db/models/role.js';
import {createUser, toEmail} from '../helpers/factories.js';
import {createHierarchy} from '../helpers/hierarchy.js';

let world;

beforeEach(async () => {
  world = await createHierarchy();
});

const readAs = (app, actor, url) =>
  app.inject({method: 'GET', url, headers: world.headers[actor]});

const asActor = (app, actor, request) =>
  app.inject({...request, headers: world.headers[actor]});

const listAs = async (app, actor, url) => {
  const response = await readAs(app, actor, url);
  expect(response.statusCode).toBe(StatusCodes.OK);
  return readEnvelope(response).data;
};

const idsListedBy = async (app, actor, url) =>
  (await listAs(app, actor, url)).items.map(row => row.id);

describe('the user list', () => {
  it('carries everyone below the actor and nobody above it', async () => {
    const app = await getTestApp();
    const ids = await idsListedBy(app, 'manager', '/users?pageSize=100');
    expect(ids).toContain(world.users.staff.id);
    expect(ids).toContain(world.users.intern.id);
    expect(ids).not.toContain(world.users.boss.id);
  });

  it('carries the actor own record, so it can edit itself from the list', async () => {
    const app = await getTestApp();
    const ids = await idsListedBy(app, 'manager', '/users?pageSize=100');
    expect(ids).toContain(world.users.manager.id);
  });

  it('hides a peer from an actor without the manage-peer permission', async () => {
    const app = await getTestApp();
    const peer = await createUser({
      email: toEmail('manager-peer'),
      roles: [world.roles.manager],
    });
    const ids = await idsListedBy(app, 'manager', '/users?pageSize=100');
    expect(ids).not.toContain(peer.id);
  });

  it('shows a peer to the holder of the manage-peer permission', async () => {
    const app = await getTestApp();
    const peer = await createUser({
      email: toEmail('boss-peer'),
      roles: [world.roles.boss],
    });
    const ids = await idsListedBy(app, 'boss', '/users?pageSize=100');
    expect(ids).toContain(peer.id);
  });

  it('judges a user by its highest role, not by the reachable one it also holds', async () => {
    const app = await getTestApp();
    const mixed = await createUser({
      email: toEmail('mixed'),
      roles: [world.roles.intern, world.roles.boss],
    });
    const ids = await idsListedBy(app, 'manager', '/users?pageSize=100');
    expect(ids).not.toContain(mixed.id);
  });

  it('shows a user that holds no role at all', async () => {
    const app = await getTestApp();
    const orphan = await createUser({email: toEmail('orphan')});
    const ids = await idsListedBy(app, 'staff', '/users?pageSize=100');
    expect(ids).toContain(orphan.id);
  });

  it('counts only what it shows, so the pager cannot promise a hidden row', async () => {
    const app = await getTestApp();
    const page = await listAs(app, 'staff', '/users?pageSize=100');
    expect(page.meta.totalItemCount).toBe(page.items.length);
  });

  it('declines to surface a hidden user through a search term', async () => {
    const app = await getTestApp();
    const page = await listAs(
      app,
      'staff',
      `/users?search=${encodeURIComponent(world.users.boss.email)}`,
    );
    expect(page.items).toEqual([]);
  });

  it('declines to confirm a hidden user through its identifier', async () => {
    const app = await getTestApp();
    const page = await listAs(
      app,
      'staff',
      `/users?search=${world.users.boss.id}`,
    );
    expect(page.items).toEqual([]);
  });

  it('declines to surface a hidden user through a role filter', async () => {
    const app = await getTestApp();
    const page = await listAs(
      app,
      'manager',
      `/users?roleId=${world.roles.boss.id}`,
    );
    expect(page.items).toEqual([]);
  });
});

describe('reading one user', () => {
  it('answers a record within reach', async () => {
    const app = await getTestApp();
    const response = await readAs(
      app,
      'manager',
      `/users/${world.users.staff.id}`,
    );
    expect(response.statusCode).toBe(StatusCodes.OK);
  });

  it('answers the actor own record', async () => {
    const app = await getTestApp();
    const response = await readAs(
      app,
      'manager',
      `/users/${world.users.manager.id}`,
    );
    expect(response.statusCode).toBe(StatusCodes.OK);
  });

  it('answers not found above the actor, rather than admitting the record exists', async () => {
    const app = await getTestApp();
    const response = await readAs(
      app,
      'staff',
      `/users/${world.users.boss.id}`,
    );
    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);
  });

  it('answers not found for a peer, until the manage-peer permission opens it', async () => {
    const app = await getTestApp();
    const peer = await createUser({
      email: toEmail('peer-subject'),
      roles: [world.roles.manager],
    });
    const hidden = await readAs(app, 'manager', `/users/${peer.id}`);
    expect(hidden.statusCode).toBe(StatusCodes.NOT_FOUND);

    const bossPeer = await createUser({
      email: toEmail('boss-subject'),
      roles: [world.roles.boss],
    });
    const shown = await readAs(app, 'boss', `/users/${bossPeer.id}`);
    expect(shown.statusCode).toBe(StatusCodes.OK);
  });
});

describe('the role list', () => {
  it('carries every role below the actor and none above it', async () => {
    const app = await getTestApp();
    const ids = await idsListedBy(app, 'manager', '/roles?pageSize=100');
    expect(ids).toContain(world.roles.staff.id);
    expect(ids).toContain(world.roles.intern.id);
    expect(ids).not.toContain(world.roles.boss.id);
  });

  it('withholds the actor own role without the manage-peer permission', async () => {
    const app = await getTestApp();
    const ids = await idsListedBy(app, 'manager', '/roles?pageSize=100');
    expect(ids).not.toContain(world.roles.manager.id);
  });

  it('includes the actor own role for the manage-peer holder', async () => {
    const app = await getTestApp();
    const ids = await idsListedBy(app, 'boss', '/roles?pageSize=100');
    expect(ids).toContain(world.roles.boss.id);
  });

  it('numbers a role by its tier in the whole hierarchy, not by its place in the visible list', async () => {
    const app = await getTestApp();
    const page = await listAs(app, 'manager', '/roles?pageSize=100');
    expect(page.items.map(row => row.rank)).toEqual([3, 4, 5]);
  });

  it('never offers as assignable a role it withholds from the list', async () => {
    const app = await getTestApp();
    const listed = await idsListedBy(app, 'manager', '/roles?pageSize=100');
    const offered = readEnvelope(
      await readAs(app, 'manager', '/roles/options'),
    ).data.map(entry => entry.id);
    expect(offered.filter(id => !listed.includes(id))).toEqual([]);
  });

  it('declines to confirm a hidden role through its identifier', async () => {
    const app = await getTestApp();
    const page = await listAs(
      app,
      'manager',
      `/roles?search=${world.roles.boss.id}`,
    );
    expect(page.items).toEqual([]);
  });
});

describe('reading one role', () => {
  it('answers not found for a role above the actor', async () => {
    const app = await getTestApp();
    const response = await readAs(
      app,
      'manager',
      `/roles/${world.roles.boss.id}`,
    );
    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);
  });

  it('answers not found for the actor own role, until the manage-peer permission opens it', async () => {
    const app = await getTestApp();
    const hidden = await readAs(
      app,
      'manager',
      `/roles/${world.roles.manager.id}`,
    );
    expect(hidden.statusCode).toBe(StatusCodes.NOT_FOUND);

    const shown = await readAs(app, 'boss', `/roles/${world.roles.boss.id}`);
    expect(shown.statusCode).toBe(StatusCodes.OK);
  });
});

describe('writing to what the actor cannot see', () => {
  it('leaves a role above the actor untouched, answering as it does for one that never existed', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'manager', {
      method: 'DELETE',
      url: `/roles/${world.roles.boss.id}`,
    });
    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(await Role.findByPk(world.roles.boss.id)).not.toBeNull();
  });

  it('answers not found when moving a role above the actor, ahead of any other refusal', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'manager', {
      method: 'PATCH',
      url: `/roles/${world.roles.boss.id}/move`,
      payload: {direction: 'up'},
    });
    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);
  });

  it('treats a hidden anchor as one that is not there when repositioning', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'manager', {
      method: 'PATCH',
      url: `/roles/${world.roles.staff.id}`,
      payload: {
        anchorRoleId: world.roles.boss.id,
        placement: RolePlacement.ABOVE,
      },
    });
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(readEnvelope(response).message).toContain('Konum rolü');
  });

  it('rejects a hidden role in a payload the way it rejects one that does not exist', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'manager', {
      method: 'PATCH',
      url: `/users/${world.users.staff.id}`,
      payload: {roleIds: [world.roles.boss.id]},
    });
    expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST);
    expect(readEnvelope(response).message).toContain('Geçersiz rol');
  });

  it('accepts back the anchor its own detail handed out', async () => {
    const app = await getTestApp();
    const detail = readEnvelope(
      await readAs(app, 'manager', `/roles/${world.roles.staff.id}`),
    ).data;
    const response = await asActor(app, 'manager', {
      method: 'PATCH',
      url: `/roles/${world.roles.staff.id}`,
      payload: {
        label: 'Renamed',
        anchorRoleId: detail.anchorRoleId,
        placement: detail.placement,
      },
    });
    expect(response.statusCode).toBe(StatusCodes.OK);
  });

  it('names as the anchor only a role the actor can see', async () => {
    const app = await getTestApp();
    const detail = readEnvelope(
      await readAs(app, 'manager', `/roles/${world.roles.staff.id}`),
    ).data;
    const visible = await idsListedBy(app, 'manager', '/roles?pageSize=100');
    expect(visible).toContain(detail.anchorRoleId);
  });

  it('offers no move up on the topmost role it shows, and the guard agrees', async () => {
    const app = await getTestApp();
    const page = await listAs(app, 'manager', '/roles?pageSize=100');
    const top = page.items[0];
    expect(top.viewerCan.moveUp).toBe(false);

    const attempted = await asActor(app, 'manager', {
      method: 'PATCH',
      url: `/roles/${top.id}/move`,
      payload: {direction: 'up'},
    });
    expect(attempted.statusCode).toBe(StatusCodes.FORBIDDEN);
  });

  it('still refuses, rather than hides, a record the actor sees but may not manage', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'boss', {
      method: 'PATCH',
      url: `/roles/${world.roles.boss.id}`,
      payload: {label: 'Renamed'},
    });
    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN);
  });
});

const READ_PROBES = {
  'GET /users': () => '/users?pageSize=100',
  'GET /users/:id': hidden => `/users/${hidden.userId}`,
  'GET /users/me': () => '/users/me',
  'GET /roles': () => '/roles?pageSize=100',
  'GET /roles/:id': hidden => `/roles/${hidden.roleId}`,
  'GET /roles/options': () => '/roles/options',
};

async function managedReadRoutes() {
  await getTestApp();
  return getRegisteredRoutes()
    .flatMap(route => routeCalls(route))
    .filter(route => route.method === 'GET')
    .filter(
      route => route.url.startsWith('/users') || route.url.startsWith('/roles'),
    );
}

describe('the read surface as a whole', () => {
  it('probes every read route the managed subtree registers', async () => {
    const registered = (await managedReadRoutes()).map(route => route.id);
    expect(registered.length).toBeGreaterThan(0);
    expect(registered.filter(id => !Object.hasOwn(READ_PROBES, id))).toEqual(
      [],
    );
    expect(
      Object.keys(READ_PROBES).filter(id => !registered.includes(id)),
    ).toEqual([]);
  });

  it('lets none of them name a record the actor cannot see', async () => {
    const app = await getTestApp();
    const peer = await createUser({
      email: toEmail('probe-peer'),
      roles: [world.roles.manager],
    });
    const hidden = {userId: world.users.boss.id, roleId: world.roles.boss.id};
    const secrets = [hidden.userId, hidden.roleId, peer.id];

    const leaks = [];
    for (const [id, toUrl] of Object.entries(READ_PROBES)) {
      const response = await asActor(app, 'manager', {
        method: 'GET',
        url: toUrl(hidden),
      });
      const body = response.body.toLowerCase();
      for (const secret of secrets) {
        if (body.includes(secret.toLowerCase())) {
          leaks.push(`${id} named ${secret}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});
