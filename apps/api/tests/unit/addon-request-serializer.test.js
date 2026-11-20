import {describe, expect, it} from 'vitest';
import {serializeAddonRequest} from '../../src/plugins/addon-route.js';

const USER_CONFIG_ID = '3f2b8c1e-7d4a-4e9b-9c1d-2a6f8e0b5c47';
const FILE_ROUTE_URL =
  '/api/addon/:userConfigId/subtitle-files/:videoId/:urlCode.:fileExtension';
const FILE_URL = `/api/addon/${USER_CONFIG_ID}/subtitle-files/tt0133093/${'a'.repeat(64)}.srt`;

function makeRequest({url, routeUrl, isDebug = false}) {
  return {
    method: 'GET',
    url,
    host: 'addon.test',
    clientIp: '203.0.113.1',
    headers: {},
    socket: {remotePort: 4000},
    log: {isLevelEnabled: level => isDebug && level === 'debug'},
    routeOptions: {url: routeUrl},
  };
}

describe('serializeAddonRequest', () => {
  it('writes only the route pattern at info', () => {
    const serialized = serializeAddonRequest(
      makeRequest({url: FILE_URL, routeUrl: FILE_ROUTE_URL}),
    );

    expect(serialized).toEqual({
      method: 'GET',
      url: FILE_ROUTE_URL,
      version: undefined,
      host: 'addon.test',
      remoteAddress: '203.0.113.1',
      remotePort: 4000,
    });
    expect(JSON.stringify(serialized)).not.toContain(USER_CONFIG_ID);
    expect(JSON.stringify(serialized)).not.toContain('tt0133093');
  });

  it('adds the path with the user config placeholder at debug', () => {
    const serialized = serializeAddonRequest(
      makeRequest({
        url: `${FILE_URL}?filename=movie.mkv`,
        routeUrl: FILE_ROUTE_URL,
        isDebug: true,
      }),
    );

    expect(serialized.path).toBe(
      `/api/addon/:userConfigId/subtitle-files/tt0133093/${'a'.repeat(64)}.srt`,
    );
    expect(JSON.stringify(serialized)).not.toContain(USER_CONFIG_ID);
  });

  it('replaces a percent-encoded user config id by its position', () => {
    const encodedId = encodeURIComponent(USER_CONFIG_ID).replace('-', '%2D');
    const serialized = serializeAddonRequest(
      makeRequest({
        url: `/api/addon/${encodedId}/subtitles/movie/tt0133093.json`,
        routeUrl: '/api/addon/:userConfigId/subtitles/:type/:videoId.json',
        isDebug: true,
      }),
    );

    expect(serialized.path).toBe(
      '/api/addon/:userConfigId/subtitles/movie/tt0133093.json',
    );
  });

  it('keeps the general manifest path as it is', () => {
    const serialized = serializeAddonRequest(
      makeRequest({
        url: '/api/manifest.json',
        routeUrl: '/api/manifest.json',
        isDebug: true,
      }),
    );

    expect(serialized).toMatchObject({
      url: '/api/manifest.json',
      path: '/api/manifest.json',
    });
  });
});
