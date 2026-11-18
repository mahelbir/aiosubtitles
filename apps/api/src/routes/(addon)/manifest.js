import {z} from 'zod';
import {StatusCodes} from 'http-status-codes';
import {
  ADDON_MANIFEST_VERSION,
  ADDON_NAME,
} from '@repo/shared/constants/app.js';
import {AddonVideoType} from './_addon-video-type.js';
import {readCachedUserConfig} from './_cached-user-config.js';

const ADDON_MANIFEST = {
  id: 'com.mahmuthanelbir.aiosubtitles',
  version: ADDON_MANIFEST_VERSION,
  name: ADDON_NAME,
  description:
    'Puts the subtitle that best fits the playing video at the top of the list.',
  resources: ['subtitles'],
  types: AddonVideoType.values,
  idPrefixes: ['tt', 'kitsu'],
  catalogs: [],
};

const GENERAL_MANIFEST = toManifest({isConfigurationRequired: true});

const USER_MANIFEST = toManifest({isConfigurationRequired: false});

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
      const userConfig = await readCachedUserConfig(
        request.params.userConfigId,
      );
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
