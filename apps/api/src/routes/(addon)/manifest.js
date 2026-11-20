import {z} from 'zod';
import {StatusCodes} from 'http-status-codes';
import {
  ADDON_DESCRIPTION,
  ADDON_MANIFEST_VERSION,
  ADDON_NAME,
} from '@repo/shared/constants/app.js';
import {config} from '../../config/index.js';
import {ADDON_ROUTE_PREFIX} from '../../lib/addon-url.js';
import {RateLimitKey} from '../../lib/rate-limit.js';
import {getRequestBaseUrl} from '../_request-base-url.js';
import {AddonVideoType} from './_addon-video-type.js';
import {readCachedUserConfig} from './_cached-user-config.js';

const ADDON_LOGO_PATH = '/logo.png';

const ADDON_MANIFEST = {
  id: 'com.mahmuthanelbir.aiosubtitles',
  version: ADDON_MANIFEST_VERSION,
  name: ADDON_NAME,
  description: ADDON_DESCRIPTION,
  resources: ['subtitles'],
  types: AddonVideoType.values,
  idPrefixes: ['tt', 'kitsu'],
  catalogs: [],
};

const MANIFEST_SCHEMA = {
  response: {
    [StatusCodes.OK]: z
      .object({
        id: z.string(),
        version: z.string(),
        name: z.string(),
        description: z.string(),
        logo: z.string(),
        resources: z.array(z.string()),
        types: z.array(z.string()),
        idPrefixes: z.array(z.string()),
        catalogs: z.array(z.never()),
        behaviorHints: z.object({
          configurable: z.boolean(),
          configurationRequired: z.boolean(),
        }),
      })
      .describe('The Stremio addon manifest'),
  },
};

const MANIFEST_RATE_LIMIT_IP_MAX = 30;

const MANIFEST_RATE_LIMIT_USER_CONFIG_MAX = 10;

const ADDON_ROUTE_CONFIG = {
  isAddonRoute: true,
  rateLimitGroup: 'manifest',
  rateLimits: [
    {max: MANIFEST_RATE_LIMIT_IP_MAX, timeWindow: config.rateLimitWindow},
    {
      key: RateLimitKey.USER_CONFIG,
      max: MANIFEST_RATE_LIMIT_USER_CONFIG_MAX,
      timeWindow: config.rateLimitWindow,
    },
  ],
  replyAddonFallback: (request, reply) =>
    reply.send(toManifest(request, {isConfigurationRequired: true})),
};

export default async function (fastify) {
  fastify.get(
    '/manifest.json',
    {schema: MANIFEST_SCHEMA, config: ADDON_ROUTE_CONFIG},
    async request => toManifest(request, {isConfigurationRequired: true}),
  );

  fastify.get(
    `${ADDON_ROUTE_PREFIX}/manifest.json`,
    {
      schema: {
        ...MANIFEST_SCHEMA,
        params: z.object({userConfigId: z.string()}),
      },
      config: ADDON_ROUTE_CONFIG,
    },
    async request => {
      const userConfig = await readCachedUserConfig(
        request.params.userConfigId,
      );
      return toManifest(request, {isConfigurationRequired: !userConfig});
    },
  );
}

function toManifest(request, {isConfigurationRequired}) {
  return {
    ...ADDON_MANIFEST,
    logo: `${getRequestBaseUrl(request)}${ADDON_LOGO_PATH}`,
    behaviorHints: {
      configurable: true,
      configurationRequired: isConfigurationRequired,
    },
  };
}
