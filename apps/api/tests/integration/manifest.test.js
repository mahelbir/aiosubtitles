import {afterEach, describe, expect, it, vi} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {uuidV4} from '../../src/lib/common.js';
import {userConfigCache} from '../../src/lib/user-config-cache.js';
import {
  getTestApp,
  getTestAppBasePath,
  getTestAppBaseUrl,
} from '../helpers/app.js';
import {readEnvelope} from '../helpers/assertions.js';
import {createUserConfig} from '../helpers/factories.js';

const STREMIO_ORIGIN = 'https://web.stremio.com';

const MANIFEST_RATE_LIMIT_IP_MAX = 30;

const GENERAL_MANIFEST = {
  id: 'com.mahmuthanelbir.aiosubtitles',
  version: '1.0.0',
  name: 'AIOSubtitles',
  description:
    'AIOSubtitles is the smartest subtitle addon. It brings many subtitle sites into one configurable addon, searches them all at once, and smartly puts the subtitle that fits your video best at the top of each language.',
  logo: `${getTestAppBaseUrl()}/logo.png`,
  resources: ['subtitles'],
  types: ['movie', 'series', 'anime'],
  idPrefixes: ['tt', 'kitsu'],
  catalogs: [],
  behaviorHints: {configurable: true, configurationRequired: true},
};

const USER_MANIFEST = {
  ...GENERAL_MANIFEST,
  behaviorHints: {configurable: true, configurationRequired: false},
};

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

describe('the manifest', () => {
  it('serves the general manifest to any origin', async () => {
    const response = await get('/manifest.json', {origin: STREMIO_ORIGIN});

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.json()).toEqual(GENERAL_MANIFEST);
  });

  it('serves a stored configuration a manifest that needs no configuration', async () => {
    const {userConfig} = await createUserConfig();

    const response = await get(`/${userConfig.id}/manifest.json`, {
      origin: STREMIO_ORIGIN,
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.json()).toEqual(USER_MANIFEST);
  });

  it('serves an unknown configuration the general manifest', async () => {
    const response = await get(`/${uuidV4()}/manifest.json`);

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.json()).toEqual(GENERAL_MANIFEST);
  });

  it('serves a deleted configuration the general manifest', async () => {
    const {userConfig} = await createUserConfig();
    const stored = await get(`/${userConfig.id}/manifest.json`);
    await userConfig.destroy();

    const deleted = await get(`/${userConfig.id}/manifest.json`);

    expect(stored.json()).toEqual(USER_MANIFEST);
    expect(deleted.statusCode).toBe(StatusCodes.OK);
    expect(deleted.json()).toEqual(GENERAL_MANIFEST);
  });

  it('serves a malformed id the general manifest without asking the cache', async () => {
    const lookup = vi.spyOn(userConfigCache, 'get');

    const response = await get('/not-a-uuid/manifest.json');

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.json()).toEqual(GENERAL_MANIFEST);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('answers the general manifest when the configuration lookup fails', async () => {
    vi.spyOn(userConfigCache, 'get').mockRejectedValueOnce(
      new Error('the cache fell over'),
    );

    const response = await get(`/${uuidV4()}/manifest.json`, {
      origin: STREMIO_ORIGIN,
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.json()).toEqual(GENERAL_MANIFEST);
  });

  it('answers a refused window with 429', async () => {
    const responses = [];
    for (let attempt = 0; attempt <= MANIFEST_RATE_LIMIT_IP_MAX; attempt += 1) {
      responses.push(await get('/manifest.json', {origin: STREMIO_ORIGIN}));
    }
    const refused = responses.at(-1);

    expect(responses.at(-2).statusCode).toBe(StatusCodes.OK);
    expect(refused.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS);
    expect(refused.headers['access-control-allow-origin']).toBe('*');
    expect(readEnvelope(refused).success).toBe(false);
  });

  it("keeps Stremio's configure link beside a user's manifest", async () => {
    const {userConfig} = await createUserConfig();

    const response = await get(`/${userConfig.id}/configure`);

    expect(response.statusCode).toBe(StatusCodes.MOVED_TEMPORARILY);
    expect(response.headers.location).toContain(
      `/configure?userConfigId=${userConfig.id}`,
    );
  });
});
