import {ConnectionError} from 'sequelize';
import {createLogger} from '../../lib/logger.js';
import {sequelize} from '../index.js';

const DB_CLI_LOG_LEVEL = 'info';

export const dbCli = {
  log: createLogger('db:cli', {level: DB_CLI_LOG_LEVEL}),

  async run(task, {cleanup} = {}) {
    try {
      this.log.info(
        {
          dialect: sequelize.getDialect(),
          database: sequelize.getDatabaseName(),
        },
        'Connecting to database...',
      );
      await sequelize.authenticate();
      await task();
    } catch (error) {
      this.log.error(
        {err: error},
        error instanceof ConnectionError
          ? 'Database connection failed'
          : 'Command failed',
      );
      process.exitCode = 1;
    } finally {
      await cleanup?.();
      await sequelize.close();
    }
  },

  async dropCaches(invalidations) {
    try {
      await Promise.all(invalidations.map(invalidate => invalidate()));
    } catch (error) {
      this.log.warn({err: error}, 'Redis unreachable, cache not dropped');
    }
  },
};
