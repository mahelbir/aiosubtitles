import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {z} from 'zod';
import {ErrorCode} from '@repo/shared/constants/error-code.js';
import {Permission} from '@repo/shared/constants/permission.js';
import {config} from '../../src/config/index.js';
import {Role} from '../../src/db/models/role.js';
import {DenialError, forbidden} from '../../src/lib/errors.js';
import {RemoteNamespace} from '../../src/sockets/remote-namespace.js';
import {RELAY_EVENT, userRoom} from '../../src/sockets/events.js';
import {generateAccessToken} from '../../src/lib/auth/token.js';
import {
  closeSockets,
  connectSocket,
  expectSilence,
  getSocketOrigin,
  waitForEvent,
} from '../helpers/sockets.js';
import {createRole, createUser, toEmail} from '../helpers/factories.js';
import {SOCKET_FIXTURE_NAMESPACE, socketFixture} from '../helpers/fixtures.js';

let admin;
let plain;

beforeEach(async () => {
  const adminRole = await createRole({
    slug: 'socket-admin',
    position: 3000,
    permissions: [Permission.ADMIN],
  });
  admin = await createUser({
    email: toEmail('socket-admin'),
    roles: [adminRole],
  });
  plain = await createUser({email: toEmail('socket-plain')});
});

afterEach(() => {
  closeSockets();
});

const tokenFor = async user => (await generateAccessToken(user.id)).token;

describe('a guarded namespace admits', () => {
  it('a user carrying the management permission', async () => {
    const client = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
      token: await tokenFor(admin),
    });
    expect(client.connected).toBe(true);
  });

  it('a service carrying the security key', async () => {
    const client = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
      securityKey: config.securityKey,
    });
    expect(client.connected).toBe(true);
  });
});

describe('a guarded namespace refuses', () => {
  it('a handshake with nothing at all', async () => {
    await expect(connectSocket(SOCKET_FIXTURE_NAMESPACE, {})).rejects.toThrow();
  });

  it('a token that is not a token', async () => {
    await expect(
      connectSocket(SOCKET_FIXTURE_NAMESPACE, {token: 'not-a-token'}),
    ).rejects.toThrow();
  });

  it('a wrong security key', async () => {
    await expect(
      connectSocket(SOCKET_FIXTURE_NAMESPACE, {securityKey: 'not-the-key'}),
    ).rejects.toThrow();
  });

  it('an authenticated user without the management permission', async () => {
    await expect(
      connectSocket(SOCKET_FIXTURE_NAMESPACE, {token: await tokenFor(plain)}),
    ).rejects.toThrow();
  });

  it('a token whose account has since been disabled', async () => {
    const token = await tokenFor(admin);
    await admin.update({disabledAt: new Date()});
    await expect(
      connectSocket(SOCKET_FIXTURE_NAMESPACE, {token}),
    ).rejects.toThrow();
  });
});

describe('a refused handshake carries the same envelope as HTTP', () => {
  it('names the reason rather than a bare code', async () => {
    const refusal = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
      token: 'not-a-token',
    }).catch(err => err);

    expect(refusal.message).toBe('Geçersiz oturum.');
    expect(refusal.data).toMatchObject({
      success: false,
      message: 'Geçersiz oturum.',
      statusCode: StatusCodes.UNAUTHORIZED,
    });
  });

  it('separates a missing session from a missing permission', async () => {
    const refusal = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
      token: await tokenFor(plain),
    }).catch(err => err);

    expect(refusal.data).toMatchObject({
      success: false,
      message: 'İzin yok.',
      statusCode: StatusCodes.FORBIDDEN,
    });
  });
});

describe('an acknowledged event answers in the envelope', () => {
  const withHandler = async (event, handler, run) => {
    socketFixture.on(event, handler);
    try {
      const client = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
        token: await tokenFor(admin),
      });
      await run(client);
    } finally {
      socketFixture.off(event, handler);
    }
  };

  it('wraps whatever the handler returned', async () => {
    await withHandler(
      'echo',
      (client, payload) => payload,
      async client => {
        await expect(
          client.timeout(2000).emitWithAck('echo', {n: 1}),
        ).resolves.toEqual({
          success: true,
          message: 'İşlem başarılı.',
          data: {n: 1},
          statusCode: StatusCodes.OK,
        });
      },
    );
  });

  it('keeps a denial readable, wording and status alike', async () => {
    await withHandler(
      'denied',
      () => {
        throw new DenialError(forbidden('Bu rol üzerinde işlem yapamazsınız.'));
      },
      async client => {
        await expect(
          client.timeout(2000).emitWithAck('denied', {}),
        ).resolves.toMatchObject({
          success: false,
          message: 'Bu rol üzerinde işlem yapamazsınız.',
          statusCode: StatusCodes.FORBIDDEN,
        });
      },
    );
  });

  it('never lets an unexpected failure speak for itself', async () => {
    const original = socketFixture.log;
    socketFixture.log = {error() {}, warn() {}};
    try {
      await withHandler(
        'boom',
        () => {
          throw new Error('connection string leaked');
        },
        async client => {
          const ack = await client.timeout(2000).emitWithAck('boom', {});
          expect(ack.message).toBe('Sunucu hatası.');
          expect(ack.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        },
      );
    } finally {
      socketFixture.log = original;
    }
  });

  it('renders a datastore failure the way HTTP does, and logs it as one', async () => {
    const original = socketFixture.log;
    const levels = [];
    socketFixture.log = {
      error: () => levels.push('error'),
      warn: () => levels.push('warn'),
    };
    try {
      await withHandler(
        'missing',
        () =>
          Role.findByPk('01920000-0000-7000-8000-000000000000', {
            attributes: ['id'],
            rejectOnEmpty: Role.notFound,
          }),
        async client => {
          await expect(
            client.timeout(2000).emitWithAck('missing', {}),
          ).resolves.toMatchObject({
            success: false,
            message: Role.notFoundMessage,
            statusCode: StatusCodes.NOT_FOUND,
          });
          // A client error is not an incident: it stays out of the log entirely.
          expect(levels).toEqual([]);
        },
      );
    } finally {
      socketFixture.log = original;
    }
  });

  it('parses a declared schema before the handler sees the payload', async () => {
    const seen = [];
    const handler = (client, payload) => {
      seen.push(payload);
      return payload;
    };
    const schema = z.object({n: z.coerce.number().int()});
    socketFixture.on('typed', handler, schema);
    try {
      const client = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
        token: await tokenFor(admin),
      });
      await expect(
        client.timeout(2000).emitWithAck('typed', {n: '7'}),
      ).resolves.toMatchObject({success: true, data: {n: 7}});
      expect(seen).toEqual([{n: 7}]);
    } finally {
      socketFixture.off('typed', handler);
    }
  });

  it('answers a schema rejection the way HTTP names its fields', async () => {
    const original = socketFixture.log;
    socketFixture.log = {error() {}, warn() {}};
    const handler = () => 'never reached';
    const schema = z.object({n: z.number()});
    socketFixture.on('typed', handler, schema);
    try {
      const client = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
        token: await tokenFor(admin),
      });
      const ack = await client.timeout(2000).emitWithAck('typed', {n: 'no'});

      expect(ack.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
      expect(ack.data.errorCode).toBe(ErrorCode.VALIDATION_ERROR);
      expect(ack.data.errors[0].field).toBe('n');
      expect(ack.message).toBe(ack.data.errors[0].message);
    } finally {
      socketFixture.off('typed', handler);
      socketFixture.log = original;
    }
  });

  it('logs a schema rejection the client cannot be told about', async () => {
    const original = socketFixture.log;
    const levels = [];
    socketFixture.log = {
      error: () => levels.push('error'),
      warn: () => levels.push('warn'),
    };
    const handler = () => 'never reached';
    socketFixture.on('untold', handler, z.object({n: z.number()}));
    try {
      const client = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
        token: await tokenFor(admin),
      });
      // No acknowledgement: the refusal has nowhere to go but the log.
      client.emit('untold', {n: 'bad'});
      await vi.waitUntil(() => levels.length > 0, {timeout: 2000});

      expect(levels).toEqual(['warn']);
      expect(client.connected).toBe(true);
    } finally {
      socketFixture.off('untold', handler);
      socketFixture.log = original;
    }
  });

  it('keeps one schema per event when a handler serves several', async () => {
    const shared = () => null;
    socketFixture.on('one', shared, z.object({a: z.number()}));
    socketFixture.on('two', shared, z.object({b: z.number()}));
    socketFixture.off('one', shared);
    try {
      expect(socketFixture._schemas.has('two')).toBe(true);
      expect(socketFixture._schemas.has('one')).toBe(false);
    } finally {
      socketFixture.off('two', shared);
    }
  });

  it('leaves a fire-and-forget emit untouched', async () => {
    const seen = [];
    await withHandler(
      'notify',
      (client, payload) => {
        seen.push(payload);
      },
      async client => {
        client.emit('notify', {n: 2});
        await vi.waitUntil(() => seen.length > 0, {timeout: 2000});
        expect(seen).toEqual([{n: 2}]);
        expect(client.connected).toBe(true);
      },
    );
  });
});

describe('delivery', () => {
  it('broadcasts to everyone on the namespace', async () => {
    const client = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
      token: await tokenFor(admin),
    });
    const received = waitForEvent(client, 'heartbeat');

    socketFixture.emit('heartbeat', {title: 'Tick', message: 'hello'});

    await expect(received).resolves.toEqual({title: 'Tick', message: 'hello'});
  });

  it('puts a user connection in its own room and reaches only that room', async () => {
    const other = await createUser({email: toEmail('socket-other')});
    const otherRole = await createRole({
      slug: 'socket-other-role',
      position: 2500,
      permissions: [Permission.ADMIN],
    });
    await other.addRoles([otherRole.id]);

    const mine = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
      token: await tokenFor(admin),
    });
    const theirs = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
      token: await tokenFor(other),
    });

    const addressed = waitForEvent(mine, 'direct');
    const bystander = expectSilence(theirs, 'direct');

    socketFixture.toUser(admin.id).emit('direct', {to: 'me'});

    await expect(addressed).resolves.toEqual({to: 'me'});
    await expect(bystander).resolves.toBe(true);
  });
});

describe('relay', () => {
  it('performs a room emit asked for by a service connection', async () => {
    const service = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
      securityKey: config.securityKey,
    });
    const listener = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
      token: await tokenFor(admin),
    });
    const received = waitForEvent(listener, 'relayed');

    service.emit(RELAY_EVENT, {
      rooms: userRoom(admin.id),
      event: 'relayed',
      args: [{via: 'service'}],
    });

    await expect(received).resolves.toEqual({via: 'service'});
  });

  it('ignores the same command from a user connection', async () => {
    const impostor = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
      token: await tokenFor(admin),
    });
    const silence = expectSilence(impostor, 'relayed');

    impostor.emit(RELAY_EVENT, {
      rooms: userRoom(admin.id),
      event: 'relayed',
      args: [{via: 'user'}],
    });

    await expect(silence).resolves.toBe(true);
  });

  it.each([
    ['a reserved event name', {rooms: 'r', event: 'disconnect'}],
    ['no event at all', {rooms: 'r'}],
    ['a room that is not a string', {rooms: {}, event: 'relayed'}],
    ['an unknown field', {rooms: 'r', event: 'relayed', extra: 1}],
  ])('refuses %s rather than throwing out of the handler', async (_l, bad) => {
    const original = socketFixture.log;
    const levels = [];
    socketFixture.log = {
      error: () => levels.push('error'),
      warn: () => levels.push('warn'),
    };
    try {
      const service = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
        securityKey: config.securityKey,
      });
      const ack = await service.timeout(2000).emitWithAck(RELAY_EVENT, bad);

      expect(ack.success).toBe(false);
      expect(ack.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
      expect(ack.data.errorCode).toBe(ErrorCode.VALIDATION_ERROR);
      expect(levels).toEqual([]);
      expect(service.connected).toBe(true);
    } finally {
      socketFixture.log = original;
    }
  });
});

describe('namespace handlers', () => {
  it('dispatches an inbound event to a registered handler', async () => {
    const seen = [];
    const handler = function (client, payload) {
      seen.push(payload);
    };
    socketFixture.on('probe', handler);
    try {
      const client = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
        token: await tokenFor(admin),
      });
      client.emit('probe', {n: 1});
      await vi.waitUntil(() => seen.length > 0, {timeout: 2000});
      expect(seen).toEqual([{n: 1}]);
    } finally {
      socketFixture.off('probe', handler);
    }
  });

  it('survives a handler that throws, and reports it', async () => {
    const reported = [];
    const original = socketFixture.log;
    const handler = () => {
      throw new Error('handler blew up');
    };
    socketFixture.log = {error: (...args) => reported.push(args)};
    socketFixture.on('explode', handler);
    try {
      const client = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
        token: await tokenFor(admin),
      });
      client.emit('explode', {});
      await vi.waitUntil(() => reported.length > 0, {timeout: 2000});
      expect(reported[0][0]).toMatchObject({event: 'explode'});
      expect(client.connected).toBe(true);
    } finally {
      socketFixture.off('explode', handler);
      socketFixture.log = original;
    }
  });
});

describe('an outbound namespace', () => {
  /* The application plays its own remote: a RemoteNamespace pointed at this
     server exercises the outbound client and the relay in one pass. */
  class SelfRemote extends RemoteNamespace {
    static namespace = SOCKET_FIXTURE_NAMESPACE;
  }

  it('connects, relays into a room, and disconnects', async () => {
    const base = await getSocketOrigin();
    SelfRemote.url = base;
    SelfRemote.auth = {securityKey: config.securityKey};

    const listener = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
      token: await tokenFor(admin),
    });
    const delivered = waitForEvent(listener, 'from-remote');

    const remote = new SelfRemote();
    const connected = new Promise(resolve => remote.on('connect', resolve));
    remote.attach({log: {info() {}, warn() {}, error() {}}});

    try {
      await connected;
      remote.toUser(admin.id).emit('from-remote', {via: 'relay'});
      await expect(delivered).resolves.toEqual({via: 'relay'});
    } finally {
      remote.disconnect();
    }
  });

  it('refuses to attach without a credential the far side accepts', async () => {
    const base = await getSocketOrigin();
    SelfRemote.url = base;
    SelfRemote.auth = {securityKey: 'not-the-key'};

    const remote = new SelfRemote();
    const refused = new Promise(resolve => {
      remote.attach({
        log: {info() {}, warn: resolve, error() {}},
      });
    });

    try {
      await expect(refused).resolves.toMatchObject({
        url: base,
        namespace: SOCKET_FIXTURE_NAMESPACE,
        err: expect.objectContaining({message: 'Geçersiz oturum.'}),
      });
    } finally {
      remote.disconnect();
    }
  });
});
