import {describe, expect, it} from 'vitest';
import {
  createGuardedLookup,
  isBlockedAddress,
} from '../../../src/lib/subtitle-sources/source-address-guard.js';
import {toSubtitleSourceError} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {toErrorText} from '../../helpers/caught-error.js';

const BLOCKED_ADDRESSES = [
  ['loopback', '127.0.0.1'],
  ['loopback, top of the range', '127.255.255.254'],
  ['private 10/8', '10.1.2.3'],
  ['private 172.16/12', '172.16.0.1'],
  ['private 172.16/12, top of the range', '172.31.255.255'],
  ['private 192.168/16', '192.168.1.10'],
  ['shared 100.64/10', '100.64.0.1'],
  ['shared 100.64/10, top of the range', '100.127.255.254'],
  ['link-local', '169.254.169.254'],
  ['unspecified', '0.0.0.0'],
  ['this network', '0.1.2.3'],
  ['broadcast', '255.255.255.255'],
  ['multicast', '224.0.0.1'],
  ['multicast, top of the range', '239.255.255.250'],
  ['reserved', '240.0.0.1'],
  ['IPv6 loopback', '::1'],
  ['IPv6 unspecified', '::'],
  ['IPv6 unique local fc00::/7', 'fc00::1'],
  ['IPv6 unique local fd00::/8', 'fd12:3456::1'],
  ['IPv6 link-local', 'fe80::1'],
  ['IPv6 scoped link-local', 'fe80::1%eth0'],
  ['IPv6 link-local, top of the range', 'febf::1'],
  ['IPv6 multicast', 'ff02::1'],
  ['IPv4-mapped loopback', '::ffff:127.0.0.1'],
  ['IPv4-mapped loopback in hex', '::ffff:7f00:1'],
  ['IPv4-mapped private', '::ffff:10.0.0.5'],
  ['IPv4-mapped shared', '::ffff:100.64.0.1'],
  ['IPv4-mapped link-local', '::ffff:169.254.169.254'],
  ['IPv4-mapped unspecified', '::ffff:0.0.0.0'],
  ['IPv4-mapped multicast', '::ffff:224.0.0.1'],
  ['IETF protocol assignments', '192.0.0.8'],
  ['documentation TEST-NET-1', '192.0.2.1'],
  ['benchmarking', '198.18.0.1'],
  ['benchmarking, top of the range', '198.19.255.255'],
  ['documentation TEST-NET-2', '198.51.100.7'],
  ['documentation TEST-NET-3', '203.0.113.9'],
  ['6to4 relay anycast', '192.88.99.1'],
  ['NAT64 well-known prefix', '64:ff9b::a9fe:a9fe'],
  ['local NAT64 prefix', '64:ff9b:1::a00:5'],
  ['6to4', '2002:a9fe:a9fe::1'],
  ['Teredo', '2001:0:4136:e378:8000:63bf:3fff:fdd2'],
  ['IPv4-translated', '::ffff:0:7f00:1'],
  ['IPv6 documentation', '2001:db8::1'],
  ['IPv6 discard-only', '100::1'],
  ['IPv6 deprecated site-local', 'fec0::1'],
];
const PUBLIC_ADDRESSES = [
  ['public IPv4', '93.184.215.14'],
  ['public next to 172.16/12', '172.32.0.1'],
  ['public next to 100.64/10', '100.128.0.1'],
  ['public next to 192.168/16', '192.169.0.1'],
  ['public IPv6', '2606:4700:4700::1111'],
  ['IPv4-mapped public', '::ffff:93.184.215.14'],
];
const ERROR_CODE_PATTERN = /^[A-Za-z][\w-]{0,63}$/;

function toFamily(address) {
  return address.includes(':') ? 6 : 4;
}

function makeResolver(addresses) {
  const calls = [];
  const resolve = (hostname, options, callback) => {
    calls.push({hostname, options});
    queueMicrotask(() =>
      callback(
        null,
        addresses.map(address => ({address, family: toFamily(address)})),
      ),
    );
  };
  return {resolve, calls};
}

function runLookup(lookup, hostname, options) {
  return new Promise(resolve => {
    lookup(hostname, options, (error, address, family) =>
      resolve({error, address, family}),
    );
  });
}

describe('isBlockedAddress', () => {
  it.each(BLOCKED_ADDRESSES)('blocks %s (%s)', (_, address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(PUBLIC_ADDRESSES)('lets %s (%s) through', (_, address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it('blocks a value that is not an address', () => {
    expect(isBlockedAddress('source.test')).toBe(true);
  });
});

describe('createGuardedLookup', () => {
  it.each(BLOCKED_ADDRESSES)(
    'refuses a host that resolves to %s (%s)',
    async (_, address) => {
      const {resolve} = makeResolver([address]);

      const {error, address: answer} = await runLookup(
        createGuardedLookup(resolve),
        'inside.source.test',
        {all: true},
      );

      expect(error).toBeInstanceOf(Error);
      expect(answer).toBeUndefined();
    },
  );

  it.each(PUBLIC_ADDRESSES)(
    'answers a host that resolves to %s (%s)',
    async (_, address) => {
      const {resolve} = makeResolver([address]);

      const {error, address: answer} = await runLookup(
        createGuardedLookup(resolve),
        'dl.source.test',
        {all: true},
      );

      expect(error).toBeNull();
      expect(answer).toEqual([{address, family: toFamily(address)}]);
    },
  );

  it('refuses a mixed answer instead of picking the public address', async () => {
    const {resolve} = makeResolver(['93.184.215.14', '10.0.0.5']);

    const {error, address} = await runLookup(
      createGuardedLookup(resolve),
      'rebind.source.test',
      {all: true},
    );

    expect(error).toBeInstanceOf(Error);
    expect(address).toBeUndefined();
  });

  it('refuses a mixed answer when one address is IPv4-mapped private', async () => {
    const {resolve} = makeResolver(['2606:4700:4700::1111', '::ffff:7f00:1']);

    const {error} = await runLookup(
      createGuardedLookup(resolve),
      'rebind.source.test',
      {all: true},
    );

    expect(error).toBeInstanceOf(Error);
  });

  it('refuses an empty answer', async () => {
    const {resolve} = makeResolver([]);

    const {error} = await runLookup(
      createGuardedLookup(resolve),
      'empty.source.test',
      {all: true},
    );

    expect(error).toBeInstanceOf(Error);
  });

  it('resolves every address even when the caller asks for one', async () => {
    const {resolve, calls} = makeResolver(['93.184.215.14', '10.0.0.5']);

    const {error} = await runLookup(
      createGuardedLookup(resolve),
      'rebind.source.test',
      {family: 0},
    );

    expect(error).toBeInstanceOf(Error);
    expect(calls).toEqual([
      {hostname: 'rebind.source.test', options: {family: 0, all: true}},
    ]);
  });

  it('answers one address and its family when the caller asks for one', async () => {
    const {resolve} = makeResolver(['93.184.215.14', '2606:4700:4700::1111']);

    await expect(
      runLookup(createGuardedLookup(resolve), 'dl.source.test', {}),
    ).resolves.toEqual({error: null, address: '93.184.215.14', family: 4});
  });

  it('takes the two-argument call without options', async () => {
    const {resolve, calls} = makeResolver(['93.184.215.14']);

    const answer = await new Promise(settle => {
      createGuardedLookup(resolve)('dl.source.test', (error, address, family) =>
        settle({error, address, family}),
      );
    });

    expect(answer).toEqual({error: null, address: '93.184.215.14', family: 4});
    expect(calls[0].options).toEqual({all: true});
  });

  it('takes a family number as the options', async () => {
    const {resolve, calls} = makeResolver(['2606:4700:4700::1111']);

    await expect(
      runLookup(createGuardedLookup(resolve), 'dl.source.test', 6),
    ).resolves.toEqual({
      error: null,
      address: '2606:4700:4700::1111',
      family: 6,
    });
    expect(calls[0].options).toEqual({family: 6, all: true});
  });

  it('passes a resolver failure through', async () => {
    const resolverError = Object.assign(new Error('getaddrinfo ENOTFOUND'), {
      code: 'ENOTFOUND',
    });

    const {error} = await runLookup(
      createGuardedLookup((hostname, options, callback) =>
        callback(resolverError),
      ),
      'missing.source.test',
      {all: true},
    );

    expect(error).toBe(resolverError);
  });

  it('refuses with a coded error that names no host or address', async () => {
    const {resolve} = makeResolver(['169.254.169.254']);

    const {error} = await runLookup(
      createGuardedLookup(resolve),
      'metadata.source.test',
      {all: true},
    );

    expect(error.code).toMatch(ERROR_CODE_PATTERN);
    expect(toErrorText(error)).not.toContain('169.254');
    expect(toErrorText(error)).not.toContain('metadata.source.test');
  });

  it('surfaces a refusal as the source error a private url gets', async () => {
    const {resolve} = makeResolver(['10.0.0.5']);

    const {error} = await runLookup(
      createGuardedLookup(resolve),
      'inside.source.test',
      {all: true},
    );
    const sourceError = toSubtitleSourceError(error, {
      subtitleSource: 'subdl',
    });

    expect(sourceError).toMatchObject({subtitleSource: 'subdl'});
    expect(sourceError.cause.message).toBe(error.code);
    expect(toErrorText(sourceError)).not.toContain('10.0.0.5');
  });
});
