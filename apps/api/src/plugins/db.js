import fp from 'fastify-plugin';
import {sequelize} from '../db/index.js';
import {mapDbError} from '../db/errors.js';
import {initializeDatabase} from '../db/init.js';
import {registerFailureMapper} from '../lib/response.js';

export default fp(
  async function dbPlugin(fastify) {
    registerFailureMapper(mapDbError);
    fastify.log.info(
      {
        dialect: sequelize.getDialect(),
        database: sequelize.getDatabaseName(),
      },
      'Connecting to database...',
    );
    await sequelize.authenticate();
    initializeDatabase();
    fastify.log.info(
      {version: await sequelize.databaseVersion()},
      'Database connected',
    );
    fastify.addHook('onClose', async () => {
      await sequelize.close();
    });
  },
  {name: 'db'},
);
