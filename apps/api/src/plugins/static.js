import fp from 'fastify-plugin';
import fastifyStatic from '@fastify/static';
import {config} from '../config/index.js';

export default fp(
  async function staticPlugin(fastify, {basePath = config.apiBasePath} = {}) {
    await fastify.register(fastifyStatic, {
      root: config.publicStoragePath,
      prefix: `${basePath}/static/`,
      dotfiles: 'deny',
    });
  },
  {name: 'static'},
);
