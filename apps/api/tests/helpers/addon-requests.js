import {vi} from 'vitest';
import {getTestApp, getTestAppBasePath} from './app.js';

const CLIENT_IP_PREFIX = '203.0.113.';

export function toClientIp(callerIndex) {
  return `${CLIENT_IP_PREFIX}${callerIndex + 1}`;
}

export function asClientIp(callerIndex) {
  return {'x-real-ip': toClientIp(callerIndex)};
}

export function toListPath({userConfigId, videoType = 'movie', videoId}) {
  return `/${userConfigId}/subtitles/${videoType}/${videoId}.json`;
}

export function toFilePath({
  userConfigId,
  videoId,
  urlCode,
  fileExtension = 'srt',
}) {
  return `/${userConfigId}/subtitle-files/${videoId}/${urlCode}.${fileExtension}`;
}

export function toNoticePath({userConfigId, noticeName}) {
  return `/${userConfigId}/subtitle-notices/${noticeName}.srt`;
}

export function toManifestPath(userConfigId) {
  return `/${userConfigId}/manifest.json`;
}

export async function requestAddonPath(addonPath, headers = {}) {
  const app = await getTestApp();
  return app.inject({
    method: 'GET',
    url: `${getTestAppBasePath()}${addonPath}`,
    headers,
  });
}

export function createStubVideoCatalog() {
  return {
    readCatalogMeta: vi.fn(async () => null),
    resolveKitsuVideo: vi.fn(async () => null),
  };
}
