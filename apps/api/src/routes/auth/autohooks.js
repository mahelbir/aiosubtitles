export default async function (fastify) {
  fastify.addHook('onRoute', route => {
    route.bodyLimit ??= 8192;
  });
}
