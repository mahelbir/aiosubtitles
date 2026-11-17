export default async function (fastify) {
  fastify.post('/logout', async (request, reply) => {
    return reply.success();
  });
}
