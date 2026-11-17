import closeWithGrace from 'close-with-grace';
import {config} from './config/index.js';
import {buildApp} from './build.js';

const fastify = buildApp();

closeWithGrace({delay: 500}, async ({signal, err}) => {
  if (err) {
    fastify.log.error(err, 'Server closing with error');
  } else {
    fastify.log.info(`${signal} received, server closing`);
  }
  await fastify.close();
});

try {
  await fastify.listen({port: config.port, host: config.host});
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
