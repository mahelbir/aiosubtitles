import {z} from 'zod';
import {StatusCodes} from 'http-status-codes';
import {
  ADDON_MANIFEST_VERSION,
  ADDON_NAME,
} from '@repo/shared/constants/app.js';
import {getUuidField} from '@repo/shared/schemas/common.js';
import {userConfigCache} from '../../lib/user-config-cache.js';

const ADDON_MANIFEST = {
  id: 'com.mahmuthanelbir.aiosubtitles',
  version: ADDON_MANIFEST_VERSION,
  name: ADDON_NAME,
  description:
    'Puts the subtitle that best fits the playing video at the top of the list.',
  resources: ['subtitles'],
  types: ['movie', 'series', 'anime'],
  idPrefixes: ['tt', 'kitsu'],
  catalogs: [],
};

const GENERAL_MANIFEST = toManifest({isConfigurationRequired: true});

const USER_MANIFEST = toManifest({isConfigurationRequired: false});

const userConfigIdField = getUuidField();

const MANIFEST_SCHEMA = {
  response: {
    [StatusCodes.OK]: z
      .object({
        id: z.string(),
        version: z.string(),
        name: z.string(),
        description: z.string(),
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

const ADDON_ROUTE_CONFIG = {
  isAddonRoute: true,
  replyAddonFallback: (request, reply) => reply.send(GENERAL_MANIFEST),
};

export default async function (fastify) {
  fastify.get(
    '/manifest.json',
    {schema: MANIFEST_SCHEMA, config: ADDON_ROUTE_CONFIG},
    async () => GENERAL_MANIFEST,
  );

  fastify.get(
    '/:userConfigId/manifest.json',
    {
      schema: {
        ...MANIFEST_SCHEMA,
        params: z.object({userConfigId: z.string()}),
      },
      config: ADDON_ROUTE_CONFIG,
    },
    async request => {
      const parsed = userConfigIdField.safeParse(request.params.userConfigId);
      if (!parsed.success) {
        return GENERAL_MANIFEST;
      }
      const userConfig = await userConfigCache.get(parsed.data);
      return userConfig ? USER_MANIFEST : GENERAL_MANIFEST;
    },
  );
}

function toManifest({isConfigurationRequired}) {
  return {
    ...ADDON_MANIFEST,
    behaviorHints: {
      configurable: true,
      configurationRequired: isConfigurationRequired,
    },
  };
}
