import {config} from '../../config/index.js';
import {roleCache} from '../../lib/auth/role-cache.js';
import {userCache} from '../../lib/user-cache.js';
import {redis} from '../../redis/index.js';
import {sequelize} from '../index.js';
import {initializeDatabase} from '../init.js';
import {dbCli} from './runner.js';

/**
 * @typedef {{transaction: import('sequelize').Transaction}} MockOptions
 * @typedef {{
 *   name: string,
 *   clear: (options: MockOptions) => Promise<number>,
 *   insert: (options: MockOptions) => Promise<number>,
 * }} Mock
 */

/** @type {Mock[]} */
const MOCKS = [];

if (config.env === 'production') {
  dbCli.log.error('Mock data is never seeded in production');
  process.exitCode = 1;
} else {
  redis.on('error', () => {});
  initializeDatabase({cacheHooks: false});

  await dbCli.run(seedMocks, {
    cleanup: async () => {
      await dbCli.dropCaches([
        () => roleCache.invalidate(),
        () => userCache.invalidateAll(),
      ]);
      redis.disconnect();
    },
  });
}

async function seedMocks() {
  await sequelize.transaction(async transaction => {
    for (const mock of MOCKS.toReversed()) {
      const removed = await mock.clear({transaction});
      dbCli.log.info({mock: mock.name, removed}, 'Mock data cleared');
    }
    for (const mock of MOCKS) {
      const inserted = await mock.insert({transaction});
      dbCli.log.info({mock: mock.name, inserted}, 'Mock data inserted');
    }
  });
}
