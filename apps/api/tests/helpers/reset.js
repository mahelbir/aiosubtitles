import {sequelize} from '../../src/db/index.js';
import {userConfigCache} from '../../src/lib/user-config-cache.js';
import {redis} from '../../src/redis/index.js';
import {fixtureRecordCache, fixtureTagCache} from './fixture-cache.js';
import {getAppModels} from './models.js';

export async function resetState() {
  const context = sequelize.getQueryInterface();
  const tables = getAppModels()
    .map(model => context.quoteIdentifier(model.tableName))
    .join(', ');
  await sequelize.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);

  await redis.flushdb();
  await Promise.all([
    fixtureRecordCache.invalidateAll(),
    fixtureTagCache.invalidateAll(),
    userConfigCache.invalidateAll(),
  ]);
}
