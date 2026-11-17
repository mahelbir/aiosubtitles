import {beforeEach, describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {Permission} from '@repo/shared/constants/permission.js';
import {RolePlacement} from '@repo/shared/constants/role.js';
import {getTestApp} from '../helpers/app.js';
import {readEnvelope} from '../helpers/assertions.js';
import {User} from '../../src/db/models/user.js';
import {
  createRole,
  createUser,
  getSeededAdminRole,
  toEmail,
} from '../helpers/factories.js';
import {createHierarchy} from '../helpers/hierarchy.js';

const ADMIN = Permission.ADMIN;
const MANAGE_PEER = Permission.USER_MANAGE_PEER;

let world;

beforeEach(async () => {
  world = await createHierarchy();
});

const asActor = (app, actor, request) =>
  app.inject({...request, headers: world.headers[actor]});

describe('managing users', () => {
  it.each([
    ['manager', 'intern', StatusCodes.OK],
    ['manager', 'staff', StatusCodes.OK],
    ['manager', 'boss', StatusCodes.NOT_FOUND],
    ['staff', 'intern', StatusCodes.OK],
    ['staff', 'manager', StatusCodes.NOT_FOUND],
    ['staff', 'boss', StatusCodes.NOT_FOUND],
    ['boss', 'manager', StatusCodes.OK],
    ['boss', 'intern', StatusCodes.OK],
  ])('%s editing %s answers %i', async (actor, subject, expected) => {
    const app = await getTestApp();
    const response = await asActor(app, actor, {
      method: 'PATCH',
      url: `/users/${world.users[subject].id}`,
      payload: {email: toEmail(`renamed-${subject}`)},
    });
    expect(response.statusCode).toBe(expected);
  });

  it('lets the manage-peer permission reach a peer, and nothing above it', async () => {
    const app = await getTestApp();
    const peer = await createUser({
      email: toEmail('boss-peer'),
      roles: [world.roles.boss],
    });
    const allowed = await asActor(app, 'boss', {
      method: 'PATCH',
      url: `/users/${peer.id}`,
      payload: {email: toEmail('renamed-peer')},
    });
    expect(allowed.statusCode).toBe(StatusCodes.OK);
  });

  it('answers not found for a peer to an actor without that permission', async () => {
    const app = await getTestApp();
    const peer = await createUser({
      email: toEmail('manager-peer'),
      roles: [world.roles.manager],
    });
    const response = await asActor(app, 'manager', {
      method: 'PATCH',
      url: `/users/${peer.id}`,
      payload: {email: toEmail('renamed-peer')},
    });
    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);
  });

  it('lets an actor edit itself but never delete itself', async () => {
    const app = await getTestApp();
    const selfEdit = await asActor(app, 'staff', {
      method: 'PATCH',
      url: `/users/${world.users.staff.id}`,
      payload: {email: toEmail('renamed-self')},
    });
    expect(selfEdit.statusCode).toBe(StatusCodes.OK);

    const selfDelete = await asActor(app, 'staff', {
      method: 'DELETE',
      url: `/users/${world.users.staff.id}`,
    });
    expect(selfDelete.statusCode).toBe(StatusCodes.FORBIDDEN);
    expect(readEnvelope(selfDelete).message).toContain('Kendi hesabınızı');
  });

  it('refuses a self-edit that reaches for a privileged field', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'staff', {
      method: 'PATCH',
      url: `/users/${world.users.staff.id}`,
      payload: {roleIds: [world.roles.boss.id]},
    });
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});

describe('assigning roles', () => {
  it.each([
    ['manager', 'intern', StatusCodes.CREATED],
    ['manager', 'staff', StatusCodes.CREATED],
    ['manager', 'manager', StatusCodes.BAD_REQUEST],
    ['manager', 'boss', StatusCodes.BAD_REQUEST],
  ])(
    '%s creating a user with the %s role answers %i',
    async (actor, roleName, expected) => {
      const app = await getTestApp();
      const response = await asActor(app, actor, {
        method: 'POST',
        url: '/users',
        payload: {
          email: toEmail(`made-by-${actor}-${roleName}`),
          password: 'test-password',
          roleIds: [world.roles[roleName].id],
        },
      });
      expect(response.statusCode).toBe(expected);
    },
  );

  it('refuses a role carrying a permission the actor does not hold', async () => {
    const app = await getTestApp();
    const privileged = await createRole({
      slug: 'privileged-low',
      position: 100,
      permissions: [ADMIN, MANAGE_PEER],
    });
    const response = await asActor(app, 'manager', {
      method: 'POST',
      url: '/users',
      payload: {
        email: toEmail('privileged-target'),
        password: 'test-password',
        roleIds: [privileged.id],
      },
    });
    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN);
    expect(readEnvelope(response).message).toContain('izinleri');
  });

  it('offers only assignable roles in the option list', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'manager', {
      method: 'GET',
      url: '/roles/options',
    });
    const offered = readEnvelope(response).data.map(entry => entry.id);
    expect(offered).toContain(world.roles.staff.id);
    expect(offered).not.toContain(world.roles.manager.id);
    expect(offered).not.toContain(world.roles.boss.id);
  });
});

describe('managing roles', () => {
  it.each([
    ['manager', 'intern', StatusCodes.OK],
    ['manager', 'staff', StatusCodes.OK],
    ['manager', 'manager', StatusCodes.NOT_FOUND],
    ['manager', 'boss', StatusCodes.NOT_FOUND],
    ['boss', 'manager', StatusCodes.OK],
  ])('%s editing the %s role answers %i', async (actor, roleName, expected) => {
    const app = await getTestApp();
    const response = await asActor(app, actor, {
      method: 'PATCH',
      url: `/roles/${world.roles[roleName].id}`,
      payload: {label: 'Renamed'},
    });
    expect(response.statusCode).toBe(expected);
  });

  it('refuses a locked role to everyone, whatever their level', async () => {
    const app = await getTestApp();
    const locked = await createRole({
      slug: 'locked-low',
      position: 100,
      isLocked: true,
    });
    const response = await asActor(app, 'boss', {
      method: 'PATCH',
      url: `/roles/${locked.id}`,
      payload: {label: 'Renamed'},
    });
    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN);
    expect(readEnvelope(response).message).toContain('Kilitli');
  });

  it('refuses granting a permission the actor does not hold', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'manager', {
      method: 'PATCH',
      url: `/roles/${world.roles.staff.id}`,
      payload: {permissions: [ADMIN, MANAGE_PEER]},
    });
    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN);
  });

  it('allows a change that leaves an unheld permission untouched', async () => {
    const app = await getTestApp();
    const mixed = await createRole({
      slug: 'mixed-low',
      position: 200,
      permissions: [MANAGE_PEER],
    });
    const response = await asActor(app, 'manager', {
      method: 'PATCH',
      url: `/roles/${mixed.id}`,
      payload: {permissions: [MANAGE_PEER]},
    });
    expect(response.statusCode).toBe(StatusCodes.OK);
  });

  it('treats an anchor out of the actor reach as one that is not there', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'manager', {
      method: 'POST',
      url: '/roles',
      payload: {
        slug: 'too-high',
        label: 'Too High',
        anchorRoleId: world.roles.manager.id,
        placement: RolePlacement.ABOVE,
        permissions: [],
      },
    });
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(readEnvelope(response).message).toContain('Konum rolü');
  });

  it('allows creating a role below the actor', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'manager', {
      method: 'POST',
      url: '/roles',
      payload: {
        slug: 'just-below',
        label: 'Just Below',
        anchorRoleId: world.roles.staff.id,
        placement: RolePlacement.BELOW,
        permissions: [],
      },
    });
    expect(response.statusCode).toBe(StatusCodes.CREATED);
  });

  it('refuses moving a role up into the actor own level', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'manager', {
      method: 'PATCH',
      url: `/roles/${world.roles.staff.id}/move`,
      payload: {direction: 'up'},
    });
    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN);
  });

  it('refuses deleting a role that still has holders', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'boss', {
      method: 'DELETE',
      url: `/roles/${world.roles.staff.id}`,
    });
    expect(response.statusCode).toBe(StatusCodes.CONFLICT);
  });
});

describe('abilities match the guards', () => {
  it('reports on each row exactly what the actor may do to it', async () => {
    const app = await getTestApp();
    const listed = readEnvelope(
      await asActor(app, 'manager', {
        method: 'GET',
        url: '/users?pageSize=100',
      }),
    ).data.items;

    const mismatches = [];
    for (const [index, row] of listed.entries()) {
      const attempted = await asActor(app, 'manager', {
        method: 'PATCH',
        url: `/users/${row.id}`,
        payload: {email: toEmail(`probe-${index}`)},
      });
      const allowed = attempted.statusCode === StatusCodes.OK;
      if (allowed !== row.viewerCan.update) {
        mismatches.push(
          `${row.email}: viewerCan.update=${row.viewerCan.update} but PATCH answered ${attempted.statusCode}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('the manage-peer permission opens users, not roles', () => {
  it('lets the holder assign its own role', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'boss', {
      method: 'POST',
      url: '/users',
      payload: {
        email: toEmail('made-peer'),
        password: 'test-password',
        roleIds: [world.roles.boss.id],
      },
    });
    expect(response.statusCode).toBe(StatusCodes.CREATED);
  });

  it('still refuses creating a role at the holder own level', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'boss', {
      method: 'POST',
      url: '/roles',
      payload: {
        slug: 'peer-role',
        label: 'Peer Role',
        anchorRoleId: world.roles.boss.id,
        placement: RolePlacement.SAME,
        permissions: [],
      },
    });
    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN);
  });

  it('still refuses editing the holder own role', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'boss', {
      method: 'PATCH',
      url: `/roles/${world.roles.boss.id}`,
      payload: {label: 'Renamed'},
    });
    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN);
  });

  it('still refuses moving the holder own role up', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'boss', {
      method: 'PATCH',
      url: `/roles/${world.roles.boss.id}/move`,
      payload: {direction: 'up'},
    });
    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN);
  });

  it('hides the actor own role as an anchor from someone without it', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'manager', {
      method: 'POST',
      url: '/roles',
      payload: {
        slug: 'manager-peer',
        label: 'Manager Peer',
        anchorRoleId: world.roles.manager.id,
        placement: RolePlacement.SAME,
        permissions: [],
      },
    });
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  it('shows the holder own role in the options and never one above it', async () => {
    const app = await getTestApp();
    const above = await createRole({slug: 'overlord', position: 9000});
    const offered = readEnvelope(
      await asActor(app, 'boss', {method: 'GET', url: '/roles/options'}),
    ).data.map(entry => entry.id);

    expect(offered).toContain(world.roles.boss.id);
    expect(offered).not.toContain(above.id);
  });
});

describe('deleting', () => {
  it('removes a user the actor may reach', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'manager', {
      method: 'DELETE',
      url: `/users/${world.users.intern.id}`,
    });
    expect(response.statusCode).toBe(StatusCodes.OK);

    const reread = await asActor(app, 'manager', {
      method: 'GET',
      url: `/users/${world.users.intern.id}`,
    });
    expect(reread.statusCode).toBe(StatusCodes.NOT_FOUND);
  });

  it('leaves a user above the actor untouched, answering as it does for one that never existed', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'staff', {
      method: 'DELETE',
      url: `/users/${world.users.boss.id}`,
    });
    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(await User.findByPk(world.users.boss.id)).not.toBeNull();
  });

  it('spares a peer from an actor without the manage-peer permission, and removes it with', async () => {
    const app = await getTestApp();
    const managerPeer = await createUser({
      email: toEmail('manager-peer'),
      roles: [world.roles.manager],
    });
    const bossPeer = await createUser({
      email: toEmail('boss-peer'),
      roles: [world.roles.boss],
    });

    const spared = await asActor(app, 'manager', {
      method: 'DELETE',
      url: `/users/${managerPeer.id}`,
    });
    expect(spared.statusCode).toBe(StatusCodes.OK);
    expect(await User.findByPk(managerPeer.id)).not.toBeNull();

    const removed = await asActor(app, 'boss', {
      method: 'DELETE',
      url: `/users/${bossPeer.id}`,
    });
    expect(removed.statusCode).toBe(StatusCodes.OK);
    expect(await User.findByPk(bossPeer.id)).toBeNull();
  });

  it('answers a user that is already gone without complaining', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'boss', {
      method: 'DELETE',
      url: '/users/018f3a2b-6c4d-7e8f-9a0b-1c2d3e4f5061',
    });
    expect(response.statusCode).toBe(StatusCodes.OK);
  });

  it('refuses a locked role to the highest actor there is', async () => {
    const app = await getTestApp();
    const seeded = await getSeededAdminRole();
    const response = await asActor(app, 'boss', {
      method: 'DELETE',
      url: `/roles/${seeded.id}`,
    });
    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN);
    expect(readEnvelope(response).message).toContain('Kilitli');
  });

  it('refuses the actor own role', async () => {
    const app = await getTestApp();
    const response = await asActor(app, 'boss', {
      method: 'DELETE',
      url: `/roles/${world.roles.boss.id}`,
    });
    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN);
  });

  it('removes an empty role below the actor', async () => {
    const app = await getTestApp();
    const spare = await createRole({slug: 'spare', position: 800});
    const response = await asActor(app, 'manager', {
      method: 'DELETE',
      url: `/roles/${spare.id}`,
    });
    expect(response.statusCode).toBe(StatusCodes.OK);
  });

  it('reports the delete ability exactly where the guard allows it', async () => {
    const app = await getTestApp();
    const listed = readEnvelope(
      await asActor(app, 'manager', {
        method: 'GET',
        url: '/users?pageSize=100',
      }),
    ).data.items;

    const mismatches = [];
    for (const row of listed) {
      const attempted = await asActor(app, 'manager', {
        method: 'DELETE',
        url: `/users/${row.id}`,
      });
      const allowed = attempted.statusCode === StatusCodes.OK;
      if (allowed !== row.viewerCan.delete) {
        mismatches.push(
          `${row.email}: viewerCan.delete=${row.viewerCan.delete} but DELETE answered ${attempted.statusCode}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});
