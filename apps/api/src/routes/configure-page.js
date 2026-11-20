import {z} from 'zod';
import {StatusCodes} from 'http-status-codes';
import {ADDON_ROUTE_PREFIX} from '../lib/addon-url.js';
import {
  CONFIGURE_PAGE_DEV_ORIGIN,
  getConfigurePageUrl,
} from '../lib/configure-page-url.js';

const REDIRECT_SCHEMA = {
  response: {
    [StatusCodes.MOVED_TEMPORARILY]: z
      .null()
      .describe('Redirects to the configure page'),
  },
};

export default async function (
  fastify,
  {devOrigin = CONFIGURE_PAGE_DEV_ORIGIN} = {},
) {
  const pageOrigin = devOrigin ?? fastify.prefix;

  fastify.get('/', {schema: REDIRECT_SCHEMA}, async (request, reply) => {
    return reply.redirect(
      getConfigurePageUrl({pageOrigin}),
      StatusCodes.MOVED_TEMPORARILY,
    );
  });

  fastify.get(
    `${ADDON_ROUTE_PREFIX}/configure`,
    {schema: REDIRECT_SCHEMA},
    async (request, reply) => {
      return reply.redirect(
        getConfigurePageUrl({
          userConfigId: request.params.userConfigId,
          pageOrigin,
        }),
        StatusCodes.MOVED_TEMPORARILY,
      );
    },
  );

  if (devOrigin) {
    fastify.get('/configure', async (request, reply) => {
      const {search} = new URL(request.url, devOrigin);
      return reply.redirect(
        `${getConfigurePageUrl({pageOrigin: devOrigin})}${search}`,
        StatusCodes.MOVED_TEMPORARILY,
      );
    });
  }
}
