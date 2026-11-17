import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import {config} from '../config/index.js';
import {RATE_LIMIT_HEADERS} from '../lib/rate-limit.js';

const exposedHeaders = config.isRateLimitHeadersEnabled
  ? RATE_LIMIT_HEADERS
  : [];

export default fp(
  async function corsPlugin(fastify) {
    await fastify.register(cors, {
      origin: config.corsOrigins,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
      exposedHeaders: exposedHeaders.length ? exposedHeaders : null,
      maxAge: 86400,
    });
  },
  {name: 'cors'},
);
