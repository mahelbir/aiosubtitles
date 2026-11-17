export default async function (fastify) {
  fastify.get('/', async (request, reply) => {
    return reply.success(await fastify.settings.getRaw());
  });
}
