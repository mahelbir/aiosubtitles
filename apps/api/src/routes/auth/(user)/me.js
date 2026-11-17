export default async function (fastify) {
  fastify.get('/me', async (request, reply) => {
    return reply.success(request.auth);
  });
}
