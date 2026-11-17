import {once} from 'node:events';
import {createServer, get, request} from 'node:http';
import {noop} from 'es-toolkit';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {
  takeBlockedRequests,
  throwIfRequestsBlocked,
} from '../helpers/network.js';

const REACHED = 'reached';

let server = null;
let port = 0;
let upgrades = 0;
let tunnels = [];

beforeAll(async () => {
  server = createServer((request, response) => response.end(REACHED));
  server.on('upgrade', (request, socket) => {
    upgrades += 1;
    socket.destroy();
  });
  server.on('connect', (request, socket) => {
    tunnels.push(request.url);
    socket.end('HTTP/1.1 200 Connection Established\r\n\r\n');
  });
  server.listen(0);
  await once(server, 'listening');
  ({port} = server.address());
});

beforeEach(() => {
  upgrades = 0;
  tunnels = [];
});

afterAll(async () => {
  server.close();
  await once(server, 'close');
});

describe('outbound network guard', () => {
  it('lets a request to a loopback server through', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    expect(await response.text()).toBe(REACHED);
  });

  it('stops a request to any other host and records it', async () => {
    const url = `http://0.0.0.0:${port}/`;

    await expect(fetch(url)).rejects.toThrow(TypeError);
    expect(takeBlockedRequests()).toEqual([url]);
  });

  it('stops a node:http request to any other host, imported by name too', async () => {
    const url = `http://0.0.0.0:${port}/`;

    await expect(once(get(url), 'response')).rejects.toThrow();
    expect(takeBlockedRequests()).toEqual([url]);
  });

  it('fails the test even when the code swallows the stopped request', async () => {
    const url = `http://0.0.0.0:${port}/`;

    await fetch(url).catch(noop);
    expect(() => throwIfRequestsBlocked()).toThrow(url);
  });

  it('lets a WebSocket to a loopback server through', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/`);

    await once(socket, 'close');
    expect(upgrades).toBe(1);
    expect(takeBlockedRequests()).toEqual([]);
  });

  it('stops a WebSocket to any other host and records it', async () => {
    const url = `ws://0.0.0.0:${port}/`;
    const socket = new WebSocket(url);

    await once(socket, 'error');
    expect(upgrades).toBe(0);
    expect(takeBlockedRequests()).toEqual([url]);
  });

  it('records a CONNECT tunnel off loopback, which msw always lets through', async () => {
    await openTunnel('example.com:443');

    expect(tunnels).toEqual(['example.com:443']);
    expect(takeBlockedRequests()).toEqual(['CONNECT example.com:443']);
  });

  it('lets a CONNECT tunnel to a loopback authority through', async () => {
    const authority = `127.0.0.1:${port}`;

    await openTunnel(authority);

    expect(tunnels).toEqual([authority]);
    expect(takeBlockedRequests()).toEqual([]);
  });
});

async function openTunnel(authority) {
  const tunnel = request({
    host: '127.0.0.1',
    port,
    method: 'CONNECT',
    path: authority,
  });
  tunnel.end();
  const [, socket] = await once(tunnel, 'connect');
  socket.destroy();
}
