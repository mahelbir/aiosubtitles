import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import {config} from '../config/index.js';
import {RATE_LIMIT_HEADERS} from '../lib/rate-limit.js';

const exposedHeaders = config.isRateLimitHeadersEnabled
  ? RATE_LIMIT_HEADERS
  : [];

const SHARED_CORS_OPTIONS = {
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  exposedHeaders: exposedHeaders.length ? exposedHeaders : null,
  maxAge: 86400,
};

const LISTED_CORS_OPTIONS = {
  ...SHARED_CORS_OPTIONS,
  origin: config.corsOrigins,
};

const ADDON_CORS_OPTIONS = {
  ...SHARED_CORS_OPTIONS,
  origin: '*',
};

export default fp(
  async function corsPlugin(fastify) {
    await fastify.register(cors, {
      delegator: async request =>
        request.routeOptions.config?.isAddonRoute
          ? ADDON_CORS_OPTIONS
          : LISTED_CORS_OPTIONS,
    });
  },
  {name: 'cors'},
);
