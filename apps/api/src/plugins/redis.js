import fp from 'fastify-plugin';
import {config} from '../config/index.js';
import {redis} from '../redis/index.js';

const NON_FLAVOR_VERSION_FIELDS = new Set(['redis_version', 'gcc_version']);

export default fp(
  async function redisPlugin(fastify) {
    fastify.log.info(
      {
        host: config.redisHost,
        port: config.redisPort,
        db: config.redisDb,
      },
      'Connecting to Redis...',
    );
    await redis.connect();
    const fields = new Map(
      (await redis.info('server'))
        .split(/\r?\n/)
        .filter(line => line.includes(':'))
        .map(line => [
          line.slice(0, line.indexOf(':')),
          line.slice(line.indexOf(':') + 1),
        ]),
    );
    const flavorField = [...fields.keys()].find(
      key => key.endsWith('_version') && !NON_FLAVOR_VERSION_FIELDS.has(key),
    );
    const name = flavorField?.replace(/_version$/, '') ?? 'redis';
    fastify.log.info(
      {version: `${name} ${fields.get(flavorField ?? 'redis_version')}`},
      'Redis connected',
    );
    fastify.addHook('onClose', async () => {
      await redis.quit();
    });
  },
  {name: 'redis'},
);
