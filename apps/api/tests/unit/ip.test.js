import {describe, expect, it} from 'vitest';
import {createClientIpResolver} from '../../src/lib/ip.js';

const HEADER = 'x-real-ip';
const CLIENT = '198.51.100.7';
const PROXY = '10.1.2.3';
const STRANGER = '203.0.113.9';

const peerOf = (remoteAddress, headers = {}) => ({remoteAddress, headers});

describe('createClientIpResolver', () => {
  it('reads the configured header from any peer while no proxy list is set', () => {
    const resolve = createClientIpResolver({header: HEADER, trustProxy: false});
    expect(resolve(peerOf(STRANGER, {[HEADER]: CLIENT}))).toBe(CLIENT);
  });

  it('ignores the header from a peer outside the trusted proxy list', () => {
    const resolve = createClientIpResolver({
      header: HEADER,
      trustProxy: ['10.0.0.0/8'],
    });
    expect(resolve(peerOf(STRANGER, {[HEADER]: CLIENT}))).toBe(STRANGER);
    expect(resolve(peerOf(PROXY, {[HEADER]: CLIENT}))).toBe(CLIENT);
  });

  it('takes the entry the edge appended last', () => {
    const resolve = createClientIpResolver({header: HEADER, trustProxy: false});
    expect(resolve(peerOf(STRANGER, {[HEADER]: `1.1.1.1, ${CLIENT}`}))).toBe(
      CLIENT,
    );
  });

  it('falls back to the forwarded-for chain a listed proxy wrote', () => {
    const resolve = createClientIpResolver({
      header: '',
      trustProxy: ['10.0.0.0/8'],
    });
    expect(resolve(peerOf(PROXY, {'x-forwarded-for': CLIENT}))).toBe(CLIENT);
    expect(resolve(peerOf(STRANGER, {'x-forwarded-for': CLIENT}))).toBe(
      STRANGER,
    );
  });

  it('follows the whole forwarded-for chain when every proxy is trusted', () => {
    const resolve = createClientIpResolver({header: '', trustProxy: true});
    expect(
      resolve(peerOf(PROXY, {'x-forwarded-for': `${CLIENT}, 10.0.0.2`})),
    ).toBe(CLIENT);
  });

  it('never reads forwarded-for while the proxy is trusted by hop count', () => {
    const resolve = createClientIpResolver({header: '', trustProxy: 1});
    expect(resolve(peerOf(STRANGER, {'x-forwarded-for': CLIENT}))).toBe(
      STRANGER,
    );
  });

  it('yields an empty identity for a peer that reports no address', () => {
    const resolve = createClientIpResolver({header: HEADER, trustProxy: false});
    expect(resolve(peerOf(undefined))).toBe('');
  });

  it.each(['Not-An-IP', '10.0.0.0/8'])(
    'yields an empty identity for a peer reporting %s, which is no address',
    value => {
      const resolve = createClientIpResolver({header: '', trustProxy: false});
      expect(resolve(peerOf(value))).toBe('');
    },
  );
});
