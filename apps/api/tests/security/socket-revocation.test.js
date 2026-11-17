import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {Permission} from '@repo/shared/constants/permission.js';
import {config} from '../../src/config/index.js';
import {generateJwt} from '../../src/lib/jwt.js';
import {generateAccessToken} from '../../src/lib/auth/token.js';
import {getScopeWith, getTestApp} from '../helpers/app.js';
import {
  authHeaders,
  createRole,
  createUser,
  toEmail,
} from '../helpers/factories.js';
import {SOCKET_FIXTURE_NAMESPACE, socketFixture} from '../helpers/fixtures.js';
import {
  closeSockets,
  connectSocket,
  expectSilence,
  waitForEvent,
} from '../helpers/sockets.js';

const SERVER_DISCONNECT = 'io server disconnect';
const SHORT_TOKEN_SECONDS = 2;
const PRINCIPAL_EVENT = 'principal';

let headers;
let adminRole;
let admin;
let peer;

beforeEach(async () => {
  const [directorRole, revocableRole, steadyRole] = await Promise.all([
    createRole({
      slug: 'director',
      position: 5000,
      permissions: [Permission.ADMIN, Permission.USER_MANAGE_PEER],
    }),
    createRole({
      slug: 'revocable-admin',
      position: 3000,
      permissions: [Permission.ADMIN],
    }),
    createRole({
      slug: 'steady-admin',
      position: 2500,
      permissions: [Permission.ADMIN],
    }),
  ]);
  const [director, revocable, steady] = await Promise.all([
    createUser({email: toEmail('director'), roles: [directorRole]}),
    createUser({email: toEmail('revocable-admin'), roles: [revocableRole]}),
    createUser({email: toEmail('steady-admin'), roles: [steadyRole]}),
  ]);
  adminRole = revocableRole;
  admin = revocable;
  peer = steady;
  headers = await authHeaders(director);
});

afterEach(() => {
  closeSockets();
});

async function connectAs(user) {
  const {token} = await generateAccessToken(user.id);
  return connectSocket(SOCKET_FIXTURE_NAMESPACE, {token});
}

function connectService() {
  return connectSocket(SOCKET_FIXTURE_NAMESPACE, {
    securityKey: config.securityKey,
  });
}

async function injectAsDirector(method, url, payload) {
  const app = await getTestApp();
  const response = await app.inject({method, url, headers, payload});
  expect(response.statusCode).toBe(StatusCodes.OK);
}

function revalidateUserSockets(userIds) {
  getScopeWith('revalidateUserSockets').revalidateUserSockets(userIds);
}

async function withPrincipalProbe(run) {
  const principals = new Map();
  const handler = client => {
    principals.set(client.id, client.data.auth);
  };
  socketFixture.on(PRINCIPAL_EVENT, handler);
  try {
    await run(async client => {
      await client.timeout(2000).emitWithAck(PRINCIPAL_EVENT);
      return principals.get(client.id);
    });
  } finally {
    socketFixture.off(PRINCIPAL_EVENT, handler);
  }
}

async function expectCutOff(revoked, steady) {
  const heard = waitForEvent(steady, 'heartbeat');
  const missed = expectSilence(revoked, 'heartbeat');
  const unaddressed = expectSilence(revoked, 'direct');

  socketFixture.emit('heartbeat', {title: 'Tick'});
  socketFixture.toUser(admin.id).emit('direct', {to: 'revoked'});

  await expect(heard).resolves.toMatchObject({title: 'Tick'});
  await expect(missed).resolves.toBe(true);
  await expect(unaddressed).resolves.toBe(true);
  expect(revoked.connected).toBe(false);
  expect(steady.connected).toBe(true);
}

const REVOCATIONS = [
  [
    'its roles are removed',
    () => injectAsDirector('PATCH', `/users/${admin.id}`, {roleIds: []}),
  ],
  [
    'its role loses the admin permission',
    () =>
      injectAsDirector('PATCH', `/roles/${adminRole.id}`, {permissions: []}),
  ],
  [
    'its account is disabled',
    () =>
      injectAsDirector('PATCH', `/users/${admin.id}`, {
        disabledAt: new Date().toISOString(),
      }),
  ],
  [
    'its account is deleted',
    () => injectAsDirector('DELETE', `/users/${admin.id}`),
  ],
];

describe('an open socket is cut off once', () => {
  it.each(REVOCATIONS)('%s', async (_label, revoke) => {
    const [revoked, steady] = await Promise.all([
      connectAs(admin),
      connectAs(peer),
    ]);
    const steadyId = steady.id;
    const dropped = waitForEvent(revoked, 'disconnect');
    const undisturbed = expectSilence(steady, 'disconnect', 500);

    await revoke();

    await expect(dropped).resolves.toBe(SERVER_DISCONNECT);
    await expect(undisturbed).resolves.toBe(true);
    await expectCutOff(revoked, steady);
    expect(steady.id).toBe(steadyId);
  });

  it('its token expires', async () => {
    const token = await generateJwt(
      {type: 'auth:access', seconds: SHORT_TOKEN_SECONDS, jti: 'short-lived'},
      {sub: admin.id},
    );
    const [revoked, steady] = await Promise.all([
      connectSocket(SOCKET_FIXTURE_NAMESPACE, {token}),
      connectAs(peer),
    ]);

    await expect(
      waitForEvent(revoked, 'disconnect', (SHORT_TOKEN_SECONDS + 2) * 1000),
    ).resolves.toBe(SERVER_DISCONNECT);
    await expectCutOff(revoked, steady);

    const refusal = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
      token,
    }).catch(err => err);
    expect(refusal.data).toMatchObject({message: 'Oturum süresi doldu.'});
  });
});

describe('an open socket stays open', () => {
  it('and carries the refreshed principal after a grant', async () => {
    await withPrincipalProbe(async readPrincipal => {
      const client = await connectAs(admin);

      await injectAsDirector('PATCH', `/roles/${adminRole.id}`, {
        permissions: [Permission.ADMIN, Permission.USER_MANAGE_PEER],
      });

      await vi.waitUntil(
        async () =>
          (await readPrincipal(client)).permissions.includes(
            Permission.USER_MANAGE_PEER,
          ),
        {timeout: 5000},
      );
      expect(client.connected).toBe(true);
    });
  });
});

describe('revalidating the user sockets directly', () => {
  it('catches a change written outside the routes', async () => {
    const [revoked, steady, service] = await Promise.all([
      connectAs(admin),
      connectAs(peer),
      connectService(),
    ]);
    const dropped = waitForEvent(revoked, 'disconnect');

    await admin.update({disabledAt: new Date()});
    revalidateUserSockets();

    await expect(dropped).resolves.toBe(SERVER_DISCONNECT);
    await expectCutOff(revoked, steady);
    expect(service.connected).toBe(true);
  });

  it('reaches only the users it names', async () => {
    const [revoked, steady] = await Promise.all([
      connectAs(admin),
      connectAs(peer),
    ]);
    await admin.update({disabledAt: new Date()});

    revalidateUserSockets([]);
    revalidateUserSockets([peer.id]);
    await expect(expectSilence(revoked, 'disconnect')).resolves.toBe(true);

    const dropped = waitForEvent(revoked, 'disconnect');
    revalidateUserSockets([admin.id]);
    await expect(dropped).resolves.toBe(SERVER_DISCONNECT);
    expect(steady.connected).toBe(true);
  });

  it('never re-checks a service connection', async () => {
    await withPrincipalProbe(async readPrincipal => {
      const [user, service] = await Promise.all([
        connectAs(peer),
        connectService(),
      ]);
      const [userBefore, serviceBefore] = await Promise.all([
        readPrincipal(user),
        readPrincipal(service),
      ]);

      revalidateUserSockets();

      await vi.waitUntil(
        async () => (await readPrincipal(user)) !== userBefore,
        {timeout: 5000},
      );
      await expect(readPrincipal(service)).resolves.toBe(serviceBefore);
    });
  });
});
