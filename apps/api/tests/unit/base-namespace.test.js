import {describe, expect, it, vi} from 'vitest';
import {RateLimitKey} from '../../src/lib/rate-limit.js';
import {BaseNamespace} from '../../src/sockets/base-namespace.js';
import {userRoom} from '../../src/sockets/events.js';
import {LocalNamespace} from '../../src/sockets/local-namespace.js';
import {RemoteNamespace} from '../../src/sockets/remote-namespace.js';

class Detached extends BaseNamespace {
  static namespace = '/detached';
}

describe('before a transport is attached', () => {
  it('says so rather than failing somewhere further down', () => {
    const namespace = new Detached();
    expect(() => namespace.emit('event')).toThrow(/attach/);
    expect(() => namespace.to('room')).toThrow(/attach/);
  });

  it('names the namespace in the complaint', () => {
    expect(() => new Detached().emit('event')).toThrow(/Detached/);
  });

  it('routes a user address through the same transport', () => {
    expect(() => new Detached().toUser('u1')).toThrow(/attach/);
  });
});

describe('handler registry', () => {
  it('chains, so registration reads as one expression', () => {
    const namespace = new Detached();
    const handler = () => {};
    expect(namespace.on('a', handler)).toBe(namespace);
    expect(namespace.off('a', handler)).toBe(namespace);
  });

  it('tolerates removing a handler that was never added', () => {
    const namespace = new Detached();
    expect(() => namespace.off('never', () => {})).not.toThrow();
  });

  it('keeps several handlers for one event without replacing them', () => {
    const namespace = new Detached();
    const bound = [];
    namespace.on('tick', () => {}).on('tick', () => {});
    namespace._eachHandler(event => bound.push(event));
    expect(bound).toEqual(['tick', 'tick']);
  });

  it('drops only the handler it was given', () => {
    const namespace = new Detached();
    const first = () => {};
    const second = () => {};
    namespace.on('tick', first).on('tick', second).off('tick', first);
    const bound = [];
    namespace._eachHandler((event, handler) => bound.push(handler));
    expect(bound).toEqual([second]);
  });
});

describe('the schema an event carries', () => {
  const schema = {parse: value => value};

  it('refuses a second schema rather than letting the last one win', () => {
    const namespace = new Detached();
    namespace.on('tick', () => {}, schema);
    expect(() =>
      namespace.on('tick', () => {}, {parse: value => value}),
    ).toThrow(/one payload/);
  });

  it('names the namespace and the event in the complaint', () => {
    const namespace = new Detached();
    namespace.on('tick', () => {}, schema);
    expect(() => namespace.on('tick', () => {}, {parse: () => null})).toThrow(
      /Detached.+tick/,
    );
  });

  it('takes the same schema again, so re-registration stays idempotent', () => {
    const namespace = new Detached();
    namespace.on('tick', () => {}, schema);
    expect(() => namespace.on('tick', () => {}, schema)).not.toThrow();
  });

  it('lets a further handler join an event that already carries one', () => {
    const namespace = new Detached();
    namespace.on('tick', () => {}, schema);
    expect(() => namespace.on('tick', () => {})).not.toThrow();
    expect(namespace._schemas.get('tick')).toBe(schema);
  });

  it('frees the event once its last handler leaves', () => {
    const namespace = new Detached();
    const handler = () => {};
    namespace.on('tick', handler, schema).off('tick', handler);
    expect(() =>
      namespace.on('tick', () => {}, {parse: () => null}),
    ).not.toThrow();
  });
});

describe('attaching', () => {
  class Unnamed extends RemoteNamespace {
    static url = 'http://remote.test';
  }

  class Pathed extends RemoteNamespace {
    static url = 'http://remote.test';
    static path = '/chat';
  }

  it('refuses a class that declares no namespace, so the boot fails', () => {
    expect(() => new Unnamed().attach()).toThrow(
      /Unnamed declares no valid namespace/,
    );
  });

  it('refuses a class that still names its channel as the path', () => {
    expect(() => new Pathed().attach()).toThrow(
      /Pathed declares no valid namespace/,
    );
  });

  it.each([
    ['an account', {key: RateLimitKey.USER}],
    ['an identity of its own', {identify: () => 'anyone'}],
  ])(
    'refuses a handshake window keyed by %s, which no handshake carries yet',
    (_name, keying) => {
      class Keyed extends LocalNamespace {
        static namespace = '/keyed';
        static rateLimits = [{max: 1, timeWindow: 1000, ...keying}];
      }

      expect(() => new Keyed().attach({})).toThrow(
        /Keyed keys a handshake window/,
      );
    },
  );
});

describe('error reporting', () => {
  it('logs the failure with the event and the namespace', () => {
    const namespace = new Detached();
    const error = vi.fn();
    namespace.log = {error};
    const failure = new Error('handler blew up');

    namespace.onError({}, 'tick', failure);

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: failure,
        event: 'tick',
        namespace: '/detached',
      }),
      expect.any(String),
    );
  });

  it('stays quiet when no logger has been attached yet', () => {
    expect(() =>
      new Detached().onError({}, 'tick', new Error('boom')),
    ).not.toThrow();
  });
});

describe('room naming', () => {
  it('derives one room per user', () => {
    expect(userRoom('abc')).toBe('user:abc');
    expect(userRoom('abc')).not.toBe(userRoom('abd'));
  });
});
