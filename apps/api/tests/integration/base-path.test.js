import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {uniq} from 'es-toolkit';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {config} from '../../src/config/index.js';
import {
  getRegisteredRoutes,
  getTestApp,
  setTestAppBasePath,
} from '../helpers/app.js';
import {HTTP_FIXTURE_URL, PAGINATION_FIXTURE_URL} from '../helpers/fixtures.js';

const BASE_PATH = '/edge/api';
const STATIC_FILE = 'base-path-fixture.txt';
const STATIC_CONTENT = 'served under the base path';

setTestAppBasePath(BASE_PATH);

const staticFilePath = () => path.join(config.publicStoragePath, STATIC_FILE);

beforeAll(async () => {
  await fs.writeFile(staticFilePath(), STATIC_CONTENT);
});

afterAll(async () => {
  await fs.rm(staticFilePath(), {force: true});
});

describe('an API mounted under a base path', () => {
  it('serves its routes there and nowhere else', async () => {
    const app = await getTestApp();
    const statusOf = async url =>
      (await app.inject({method: 'GET', url})).statusCode;

    expect(await statusOf(BASE_PATH + HTTP_FIXTURE_URL)).toBe(StatusCodes.OK);
    expect(await statusOf(HTTP_FIXTURE_URL)).toBe(StatusCodes.NOT_FOUND);
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
    expect(tagsAt(BASE_PATH + PAGINATION_FIXTURE_URL)).toEqual([
      '__fixtures__',
    ]);
  });
});
