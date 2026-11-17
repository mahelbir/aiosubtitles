import {afterEach, describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {Permission} from '@repo/shared/constants/permission.js';
import {config} from '../../src/config/index.js';
import {generateAccessToken} from '../../src/lib/auth/token.js';
import {socket} from '../../src/sockets/index.js';
import {GLOBAL_HANDSHAKE_WINDOW} from '../../src/plugins/sockets.js';
import {Monitor} from '../../src/sockets/namespaces/monitor.js';
import {createRole, createUser, toEmail} from '../helpers/factories.js';
import {closeSockets, connectSocket, waitForEvent} from '../helpers/sockets.js';

afterEach(() => {
  closeSockets();
});

const tokenFor = async user => (await generateAccessToken(user.id)).token;

async function createAdmin() {
  const role = await createRole({
    slug: 'monitor-admin',
    position: 3000,
    permissions: [Permission.ADMIN],
  });
  return createUser({email: toEmail('monitor-admin'), roles: [role]});
}

describe('the monitor namespace', () => {
  it('admits a user carrying the management permission', async () => {
    const client = await connectSocket(Monitor.namespace, {
      token: await tokenFor(await createAdmin()),
    });
    expect(client.connected).toBe(true);
  });

  it('admits a service carrying the security key', async () => {
    const client = await connectSocket(Monitor.namespace, {
      securityKey: config.securityKey,
    });
    expect(client.connected).toBe(true);
  });

  it('refuses a user without the management permission', async () => {
    const plain = await createUser({email: toEmail('monitor-plain')});
    await expect(
      connectSocket(Monitor.namespace, {token: await tokenFor(plain)}),
    ).rejects.toThrow();
  });

  it('turns away a caller whose handshakes keep failing, even with the key', async () => {
    for (let index = 0; index < GLOBAL_HANDSHAKE_WINDOW.max; index += 1) {
      await connectSocket(Monitor.namespace, {
        securityKey: 'not-the-key',
      }).catch(err => err);
    }

    const refusal = await connectSocket(Monitor.namespace, {
      securityKey: config.securityKey,
    }).catch(err => err);

    expect(refusal.data).toMatchObject({
      statusCode: StatusCodes.TOO_MANY_REQUESTS,
    });
  });
});

describe('a monitor line', () => {
  it('carries an opaque id and falls back to the debug level', async () => {
    const client = await connectSocket(Monitor.namespace, {
      securityKey: config.securityKey,
    });
    const received = waitForEvent(client, 'heartbeat');

    socket.monitor.line('heartbeat', {id: 7, title: 'Tick', message: 'hello'});

    await expect(received).resolves.toEqual({
      id: Buffer.from('7').toString('base64url'),
      title: 'Tick',
      message: 'hello',
      level: 'debug',
      data: null,
    });
  });

  it('keeps the level it was given', async () => {
    const client = await connectSocket(Monitor.namespace, {
      securityKey: config.securityKey,
    });
    const received = waitForEvent(client, 'heartbeat');

    socket.monitor.line('heartbeat', {
      id: 7,
      title: 'Tick',
      message: 'hello',
      level: 'info',
    });

    await expect(received).resolves.toMatchObject({level: 'info'});
  });
});
