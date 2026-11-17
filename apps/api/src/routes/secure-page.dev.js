export default async function (fastify) {
  fastify.get(
    '/guard-get',
    {onRequest: [fastify.requireSecurityKey]},
    async (request, reply) => {
      return reply.success();
    },
  );

  fastify.post(
    '/secure-guard-post',
    {onRequest: [fastify.requireSecurityKey]},
    async (request, reply) => {
      return reply.success();
    },
  );
}
