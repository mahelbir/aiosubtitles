import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {uniq} from 'es-toolkit';
import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {config} from '../../src/config/index.js';
import {SECURITY_KEY_HEADER} from '../../src/plugins/security-key.js';
import {RemoteNamespace} from '../../src/sockets/remote-namespace.js';
import {
  getRegisteredRoutes,
  getTestApp,
  setTestAppBasePath,
} from '../helpers/app.js';
import {
  SECURITY_KEY_FIXTURE_URL,
  SETTINGS_FIXTURE_URL,
  SOCKET_FIXTURE_NAMESPACE,
} from '../helpers/fixtures.js';
import {
  closeSockets,
  connectSocket,
  getSocketOrigin,
} from '../helpers/sockets.js';

const BASE_PATH = '/edge/api';
const STATIC_FILE = 'base-path-fixture.txt';
const STATIC_CONTENT = 'served under the base path';

setTestAppBasePath(BASE_PATH);

class SelfRemote extends RemoteNamespace {
  static namespace = SOCKET_FIXTURE_NAMESPACE;
  static path = `${BASE_PATH}/socket.io`;
  static auth = {securityKey: config.securityKey};
}

const staticFilePath = () => path.join(config.publicStoragePath, STATIC_FILE);

beforeAll(async () => {
  await fs.writeFile(staticFilePath(), STATIC_CONTENT);
});

afterAll(async () => {
  await fs.rm(staticFilePath(), {force: true});
});

afterEach(() => {
  closeSockets();
});

describe('an API mounted under a base path', () => {
  it('serves its routes there and nowhere else', async () => {
    const app = await getTestApp();
    const statusOf = async url =>
      (
        await app.inject({
          method: 'GET',
          url,
          headers: {[SECURITY_KEY_HEADER]: config.securityKey},
        })
      ).statusCode;

    expect(await statusOf(BASE_PATH + SECURITY_KEY_FIXTURE_URL)).toBe(
      StatusCodes.OK,
    );
    expect(await statusOf(SECURITY_KEY_FIXTURE_URL)).toBe(
      StatusCodes.NOT_FOUND,
    );
  });

  it('answers outside it with the same not-found envelope and headers', async () => {
    const app = await getTestApp();
    const response = await app.inject({method: 'GET', url: '/outside'});

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);
    expect(response.json()).toMatchObject({
      success: false,
      message: 'Sayfa bulunamadı.',
    });
    expect(response.headers['x-frame-options']).toBe('DENY');
  });

  it('serves the public storage under it', async () => {
    const app = await getTestApp();
    const served = await app.inject({
      method: 'GET',
      url: `${BASE_PATH}/static/${STATIC_FILE}`,
    });
    const atRoot = await app.inject({
      method: 'GET',
      url: `/static/${STATIC_FILE}`,
    });

    expect(served.statusCode).toBe(StatusCodes.OK);
    expect(served.body).toBe(STATIC_CONTENT);
    expect(atRoot.statusCode).toBe(StatusCodes.NOT_FOUND);
  });

  it('carries the socket layer under it', async () => {
    const client = await connectSocket(SOCKET_FIXTURE_NAMESPACE, {
      securityKey: config.securityKey,
    });
    const atRoot = await fetch(
      `${await getSocketOrigin()}/socket.io/?EIO=4&transport=polling`,
    );

    expect(client.connected).toBe(true);
    expect(atRoot.status).toBe(StatusCodes.NOT_FOUND);
    expect(await atRoot.json()).toMatchObject({success: false});
  });

  it('lets an outbound namespace reach a remote mounted under one', async () => {
    SelfRemote.url = await getSocketOrigin();
    const remote = new SelfRemote();
    const connected = new Promise(resolve => {
      remote.attach({log: {info: resolve, warn() {}, error() {}}});
    });

    try {
      await expect(connected).resolves.toEqual({
        url: SelfRemote.url,
        path: SelfRemote.path,
        namespace: SelfRemote.namespace,
      });
    } finally {
      remote.disconnect();
    }
  });

  it('mounts every route under it, the CORS preflight aside', async () => {
    await getTestApp();
    const outside = getRegisteredRoutes()
      .map(route => route.url)
      .filter(url => url !== '*' && !url.startsWith(BASE_PATH));

    expect(outside).toEqual([]);
  });

  it('tags each route by the segment after it', async () => {
    await getTestApp();
    const tagsAt = prefix =>
      uniq(
        getRegisteredRoutes()
          .filter(route => route.prefix === prefix)
          .flatMap(route => route.schema.tags),
      );

    expect(tagsAt(BASE_PATH)).toEqual(['default']);
    expect(tagsAt(BASE_PATH + SETTINGS_FIXTURE_URL)).toEqual(['__fixtures__']);
  });
});
