import {afterEach, describe, expect, it} from 'vitest';
import Fastify from 'fastify';
import clientIpPlugin from '../../src/plugins/client-ip.js';

const HEADER = 'x-real-ip';
const CLIENT = '198.51.100.7';

const opened = [];

async function buildFixture(trustProxy) {
  const app = Fastify({logger: false});
  opened.push(app);
  await app.register(clientIpPlugin, {header: HEADER, trustProxy});
  app.get('/ip', async request => ({clientIp: request.clientIp}));
  await app.ready();
  return app;
}

async function clientIpOf(app, remoteAddress) {
  const response = await app.inject({
    method: 'GET',
    url: '/ip',
    remoteAddress,
    headers: {[HEADER]: CLIENT},
  });
  return response.json().clientIp;
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map(app => app.close()));
});

describe('the client address header', () => {
  it('is read from any peer while the proxy is trusted by hop count', async () => {
    const app = await buildFixture(1);
    expect(await clientIpOf(app, '203.0.113.9')).toBe(CLIENT);
  });

  it('is read from a peer inside the trusted proxy list', async () => {
    const app = await buildFixture(['10.0.0.0/8']);
    expect(await clientIpOf(app, '10.1.2.3')).toBe(CLIENT);
  });

  it('is ignored from a peer outside the trusted proxy list', async () => {
    const app = await buildFixture(['10.0.0.0/8']);
    expect(await clientIpOf(app, '203.0.113.9')).toBe('203.0.113.9');
  });

  it('honours the named ranges Fastify accepts in the list', async () => {
    const app = await buildFixture(['loopback']);
    expect(await clientIpOf(app, '127.0.0.1')).toBe(CLIENT);
    expect(await clientIpOf(app, '203.0.113.9')).toBe('203.0.113.9');
  });
});

describe('the forwarded-for chain', () => {
  it('names the caller once a listed proxy wrote it', async () => {
    const app = await buildFixture(['10.0.0.0/8']);
    const response = await app.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress: '10.1.2.3',
      headers: {'x-forwarded-for': CLIENT},
    });
    expect(response.json().clientIp).toBe(CLIENT);
  });
});

describe('the resolver the plugin shares', () => {
  it.each([
    ['the edge header', {[HEADER]: CLIENT}],
    ['the forwarded-for chain', {'x-forwarded-for': CLIENT}],
  ])(
    'names the caller a request would carry through %s',
    async (_name, headers) => {
      const app = await buildFixture(['10.0.0.0/8']);
      const peer = {remoteAddress: '10.1.2.3', headers};
      const response = await app.inject({method: 'GET', url: '/ip', ...peer});

      expect(app.resolveClientIp(peer)).toBe(CLIENT);
      expect(response.json().clientIp).toBe(CLIENT);
    },
  );
});
