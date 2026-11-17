import fp from 'fastify-plugin';
import compress from '@fastify/compress';

export default fp(
  async function compressPlugin(fastify) {
    await fastify.register(compress, {threshold: 1024});
  },
  {name: 'compress'},
);
