import {uniq} from 'es-toolkit';
import {describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {
  getRegisteredRoutes,
  getTestApp,
  setTestAppBasePath,
  setTestAppPlugins,
} from '../helpers/app.js';
import {HTTP_FIXTURE_URL} from '../helpers/fixtures.js';

const BASE_PATH = '/edge/api';
const PREFIXED_FIXTURE_URL = '/__fixtures__/prefixed';

async function prefixedFixture(fastify) {
  await fastify.register(
    async scope => {
      scope.get('/', async (request, reply) => reply.success());
    },
    {prefix: PREFIXED_FIXTURE_URL},
  );
}

setTestAppBasePath(BASE_PATH);
setTestAppPlugins([prefixedFixture]);

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
      message: 'Page not found.',
    });
    expect(response.headers['x-frame-options']).toBe('DENY');
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
    expect(tagsAt(BASE_PATH + PREFIXED_FIXTURE_URL)).toEqual(['__fixtures__']);
  });
});
