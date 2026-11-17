export default async function (fastify) {
  fastify.guardSubtree([fastify.authenticate]);
}
