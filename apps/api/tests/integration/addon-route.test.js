import {afterEach, describe, expect, it, vi} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {ConnectionError} from 'sequelize';
import {ErrorCode} from '@repo/shared/constants/error-code.js';
import {config} from '../../src/config/index.js';
import {
  getTestApp,
  getTestAppBasePath,
  setTestAppPlugins,
} from '../helpers/app.js';
import {readEnvelope} from '../helpers/assertions.js';

const ADDON_FIXTURE_URL = '/__fixtures__/addon';
const ADDON_ANSWERING_LIMIT_URL = `${ADDON_FIXTURE_URL}/answering-limit`;
const ADDON_SILENT_LIMIT_URL = `${ADDON_FIXTURE_URL}/silent-limit`;
const ADDON_EXTRA_URL = `${ADDON_FIXTURE_URL}/extras`;
const ENVELOPE_FIXTURE_URL = '/__fixtures__/envelope';
const STREMIO_ORIGIN = 'https://web.stremio.com';

const ANSWERED_BODY = {subtitles: [{id: 'answered'}]};
const FALLBACK_BODY = {subtitles: []};
const REFUSED_BODY = {subtitles: [], isRefused: true};

const ONE_PER_MINUTE = [{max: 1, timeWindow: 60000}];

const addonFixture = {answer: async () => ANSWERED_BODY};

const replyAddonFallback = (request, reply) => reply.send(FALLBACK_BODY);

async function addonRouteFixture(fastify) {
  fastify.get(
    ADDON_FIXTURE_URL,
    {config: {isAddonRoute: true, replyAddonFallback}},
    async () => addonFixture.answer(),
  );
  fastify.get(
    ADDON_ANSWERING_LIMIT_URL,
    {
      config: {
        isAddonRoute: true,
        replyAddonFallback,
        rateLimits: ONE_PER_MINUTE,
        onRateLimited: (request, rateLimitResult, reply) =>
          reply.send(REFUSED_BODY),
      },
    },
    async () => ANSWERED_BODY,
  );
  fastify.get(
    ADDON_SILENT_LIMIT_URL,
    {
      config: {
        isAddonRoute: true,
        replyAddonFallback,
        rateLimits: ONE_PER_MINUTE,
        onRateLimited: () => {},
      },
    },
    async () => ANSWERED_BODY,
  );
  fastify.get(
    `${ADDON_EXTRA_URL}/:extra.json`,
    {config: {isAddonRoute: true, replyAddonFallback}},
    async request => ({extraLength: request.params.extra.length}),
  );
  fastify.get(ENVELOPE_FIXTURE_URL, async (request, reply) =>
    reply.success(await addonFixture.answer()),
  );
}

setTestAppPlugins([addonRouteFixture]);

afterEach(() => {
  vi.restoreAllMocks();
});

async function get(url, headers = {}) {
  const app = await getTestApp();
  return app.inject({
    method: 'GET',
    url: getTestAppBasePath() + url,
    headers,
  });
}

describe('an addon route', () => {
  it('allows any origin', async () => {
    const response = await get(ADDON_FIXTURE_URL, {origin: STREMIO_ORIGIN});

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.json()).toEqual(ANSWERED_BODY);
  });

  it('answers a thrown error through the fallback', async () => {
    vi.spyOn(addonFixture, 'answer').mockRejectedValueOnce(
      new Error('the subtitle site fell over'),
    );

    const response = await get(ADDON_FIXTURE_URL, {origin: STREMIO_ORIGIN});

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.json()).toEqual(FALLBACK_BODY);
    expect(response.body).not.toContain('the subtitle site fell over');
  });

  it('answers a Sequelize ConnectionError through the fallback', async () => {
    vi.spyOn(addonFixture, 'answer').mockRejectedValueOnce(
      new ConnectionError(new Error('connect ECONNREFUSED 127.0.0.1:5432')),
    );

    const response = await get(ADDON_FIXTURE_URL);

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.json()).toEqual(FALLBACK_BODY);
  });

  it('answers a refused window through an onRateLimited that sends the reply', async () => {
    const allowed = await get(ADDON_ANSWERING_LIMIT_URL);
    const refused = await get(ADDON_ANSWERING_LIMIT_URL, {
      origin: STREMIO_ORIGIN,
    });

    expect(allowed.statusCode).toBe(StatusCodes.OK);
    expect(allowed.json()).toEqual(ANSWERED_BODY);
    expect(refused.statusCode).toBe(StatusCodes.OK);
    expect(refused.headers['access-control-allow-origin']).toBe('*');
    expect(refused.json()).toEqual(REFUSED_BODY);
  });

  it('answers a refused window with 429 when onRateLimited sends nothing', async () => {
    await get(ADDON_SILENT_LIMIT_URL);
    const refused = await get(ADDON_SILENT_LIMIT_URL, {
      origin: STREMIO_ORIGIN,
    });

    expect(refused.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS);
    expect(refused.headers['access-control-allow-origin']).toBe('*');
    expect(readEnvelope(refused).success).toBe(false);
  });

  it('routes a 600-character extra segment', async () => {
    const extra = `filename=${'a'.repeat(591)}`;

    const response = await get(`${ADDON_EXTRA_URL}/${extra}.json`);

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.json()).toEqual({extraLength: 600});
  });
});

describe('a non-addon route', () => {
  it('keeps the envelope and CORS list on a non-addon fixture route', async () => {
    vi.spyOn(addonFixture, 'answer').mockRejectedValue(
      new Error('the datastore fell over'),
    );

    const [stremio, listed] = await Promise.all([
      get(ENVELOPE_FIXTURE_URL, {origin: STREMIO_ORIGIN}),
      get(ENVELOPE_FIXTURE_URL, {origin: config.corsOrigins[0]}),
    ]);

    expect(stremio.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(readEnvelope(stremio).data.errorCode).toBe(ErrorCode.INTERNAL_ERROR);
    expect(stremio.headers['access-control-allow-origin']).toBeUndefined();
    expect(listed.headers['access-control-allow-origin']).toBe(
      config.corsOrigins[0],
    );
  });
});
