import {readFileSync} from 'node:fs';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import {
  serializerCompiler,
  validatorCompiler,
} from '@fastify/type-provider-zod';
import {describe, expect, it, vi} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {buildClientCsp} from '../../src/lib/client-csp.js';
import {tooManyRequests} from '../../src/lib/errors.js';
import {GLOBAL_RATE_LIMIT_SCOPE} from '../../src/lib/rate-limit.js';
import clientExport from '../../src/plugins/client-export.js';
import {redis} from '../../src/redis/index.js';
import configurePageRoutes from '../../src/routes/configure-page.js';
import {
  getTestApp,
  getTestAppBasePath,
  setTestAppPlugins,
} from '../helpers/app.js';
import {readEnvelope} from '../helpers/assertions.js';
import {
  CLIENT_EXPORT_ASSET_PATH,
  CLIENT_EXPORT_FIXTURE_ROOT,
  UUID_V4,
  fixturePath,
} from '../helpers/client-export.js';
import {HTTP_FIXTURE_URL} from '../helpers/fixtures.js';

const clientExportFixture = fp(
  async function clientExportFixture(fastify) {
    await fastify.register(clientExport, {root: CLIENT_EXPORT_FIXTURE_ROOT});
  },
  {name: 'client-export-fixture'},
);

const rateLimitStub = fp(async function rateLimitStub() {}, {
  name: 'rate-limit',
});

setTestAppPlugins([clientExportFixture]);

const configureHtml = readFileSync(fixturePath('configure.html'), 'utf8');

const CONFIGURE_PAGE_IP_MAX = 60;
const GLOBAL_WINDOW_RESET_ATTEMPT = 41;
const RATE_LIMIT_NAMESPACE = 'rate:';

async function get(url) {
  const app = await getTestApp();
  return app.inject({method: 'GET', url: getTestAppBasePath() + url});
}

async function clearGlobalBuckets() {
  const globalBuckets = await redis.keys(
    `${RATE_LIMIT_NAMESPACE}*${GLOBAL_RATE_LIMIT_SCOPE}*`,
  );
  await redis.del(...globalBuckets);
}

describe('the exported client served by the API', () => {
  it('serves the configure page', async () => {
    const response = await get('/configure');

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
    expect(response.body).toBe(configureHtml);
  });

  it('serves the configure page whatever its query', async () => {
    const response = await get(`/configure?userConfigId=${UUID_V4}`);

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.body).toBe(configureHtml);
  });

  it('serves the static assets the page loads', async () => {
    const response = await get(CLIENT_EXPORT_ASSET_PATH);

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.rawPayload).toEqual(
      readFileSync(fixturePath(CLIENT_EXPORT_ASSET_PATH)),
    );
  });

  it('caches hashed assets for good and revalidates the rest', async () => {
    const [hashed, payload] = await Promise.all([
      get(CLIENT_EXPORT_ASSET_PATH),
      get('/configure.txt'),
    ]);

    expect(hashed.statusCode).toBe(StatusCodes.OK);
    expect(hashed.headers['cache-control']).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(payload.statusCode).toBe(StatusCodes.OK);
    expect(payload.headers['cache-control']).toBe('public, max-age=0');
  });

  it('serves a nested index page at its folder', async () => {
    const nestedHtml = readFileSync(fixturePath('nested/index.html'), 'utf8');

    const response = await get('/nested');

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.body).toBe(nestedHtml);
    expect(response.headers['content-security-policy']).toBe(
      buildClientCsp(nestedHtml),
    );
  });

  it('serves no raw page, dotfile, folder or auxiliary page', async () => {
    const responses = await Promise.all(
      ['/configure.html', '/.hidden', '/_next/', '/404', '/404.html'].map(get),
    );

    expect(responses.map(({statusCode}) => statusCode)).toEqual(
      responses.map(() => StatusCodes.NOT_FOUND),
    );
  });

  it('sends the page the policy built from its own scripts', async () => {
    const response = await get('/configure');

    expect(response.headers['content-security-policy']).toBe(
      buildClientCsp(configureHtml),
    );
  });

  it("keeps Helmet's policy on every other path", async () => {
    const responses = await Promise.all([get(HTTP_FIXTURE_URL), get('/')]);

    for (const {headers} of responses) {
      expect(headers['content-security-policy']).toContain(
        "default-src 'none'",
      );
      expect(headers['content-security-policy']).not.toContain('script-src');
    }
  });

  it('refuses with too many requests once one address spends the page window', async () => {
    const statusCodes = [];
    let refused = null;
    for (let attempt = 1; attempt <= CONFIGURE_PAGE_IP_MAX + 1; attempt += 1) {
      if (attempt === GLOBAL_WINDOW_RESET_ATTEMPT) {
        await clearGlobalBuckets();
      }
      refused = await get(attempt % 2 === 0 ? '/nested' : '/configure');
      statusCodes.push(refused.statusCode);
    }
    const pageBuckets = await redis.keys(
      `${RATE_LIMIT_NAMESPACE}ip:${CONFIGURE_PAGE_IP_MAX}/*`,
    );
    const asset = await get(CLIENT_EXPORT_ASSET_PATH);

    expect(statusCodes).toEqual([
      ...Array(CONFIGURE_PAGE_IP_MAX).fill(StatusCodes.OK),
      StatusCodes.TOO_MANY_REQUESTS,
    ]);
    expect(readEnvelope(refused)).toMatchObject({
      success: false,
      message: tooManyRequests().message,
    });
    expect(pageBuckets).toHaveLength(1);
    expect(asset.statusCode).toBe(StatusCodes.OK);
  });
});

describe('the configure page redirects', () => {
  it('sends the root to the configure page', async () => {
    const response = await get('/');

    expect(response.statusCode).toBe(StatusCodes.MOVED_TEMPORARILY);
    expect(response.headers.location).toBe('/configure');
  });

  it("sends Stremio's configure link to the page with the config's id", async () => {
    const response = await get(`/addon/${UUID_V4}/configure`);

    expect(response.statusCode).toBe(StatusCodes.MOVED_TEMPORARILY);
    expect(response.headers.location).toBe(
      `/configure?userConfigId=${UUID_V4}`,
    );
  });

  it('drops a UUID that is not version 4', async () => {
    const ids = [
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      '01890a5d-ac96-774b-bcce-b302099a8057',
      '00000000-0000-0000-0000-000000000000',
    ];
    const responses = await Promise.all(
      ids.map(id => get(`/addon/${id}/configure`)),
    );

    for (const response of responses) {
      expect(response.statusCode).toBe(StatusCodes.MOVED_TEMPORARILY);
      expect(response.headers.location).toBe('/configure');
    }
  });

  it('drops an id that is not a UUID', async () => {
    const response = await get('/addon/not-a-uuid/configure');

    expect(response.statusCode).toBe(StatusCodes.MOVED_TEMPORARILY);
    expect(response.headers.location).toBe('/configure');
  });
});

describe('an API booted for development', () => {
  it('leaves the configure page to the dev server even with an export', async () => {
    const devOrigin = 'http://127.0.0.1:3000';
    const app = Fastify({logger: false});
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(rateLimitStub);
    await app.register(clientExport, {
      root: CLIENT_EXPORT_FIXTURE_ROOT,
      devOrigin,
    });
    await app.register(configurePageRoutes, {devOrigin});
    await app.ready();

    try {
      const [root, page, stored, asset] = await Promise.all([
        app.inject({method: 'GET', url: '/'}),
        app.inject({method: 'GET', url: `/configure?userConfigId=${UUID_V4}`}),
        app.inject({method: 'GET', url: `/addon/${UUID_V4}/configure`}),
        app.inject({method: 'GET', url: CLIENT_EXPORT_ASSET_PATH}),
      ]);

      expect(root.statusCode).toBe(StatusCodes.MOVED_TEMPORARILY);
      expect(root.headers.location).toBe(`${devOrigin}/configure`);
      expect(page.statusCode).toBe(StatusCodes.MOVED_TEMPORARILY);
      expect(page.headers.location).toBe(
        `${devOrigin}/configure?userConfigId=${UUID_V4}`,
      );
      expect(stored.statusCode).toBe(StatusCodes.MOVED_TEMPORARILY);
      expect(stored.headers.location).toBe(
        `${devOrigin}/configure?userConfigId=${UUID_V4}`,
      );
      expect(asset.statusCode).toBe(StatusCodes.NOT_FOUND);
    } finally {
      await app.close();
    }
  });
});

describe('an API booted without the export', () => {
  it('warns once, serves nothing and still redirects the root', async () => {
    const app = Fastify({logger: false});
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const warn = vi.spyOn(app.log, 'warn');
    await app.register(rateLimitStub);
    await app.register(clientExport, {
      root: fixturePath('missing'),
    });
    await app.register(configurePageRoutes);
    await app.ready();

    try {
      const [root, page] = await Promise.all([
        app.inject({method: 'GET', url: '/'}),
        app.inject({method: 'GET', url: '/configure'}),
      ]);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(root.statusCode).toBe(StatusCodes.MOVED_TEMPORARILY);
      expect(root.headers.location).toBe('/configure');
      expect(page.statusCode).toBe(StatusCodes.NOT_FOUND);
    } finally {
      await app.close();
    }
  });
});
