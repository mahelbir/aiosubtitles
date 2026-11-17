import {sequelize} from '../../src/db/index.js';
import {redis} from '../../src/redis/index.js';
import {roleCache} from '../../src/lib/auth/role-cache.js';
import {userCache} from '../../src/lib/user-cache.js';
import * as roleSeeder from '../../src/db/seeders/00001-roles.js';
import * as userSeeder from '../../src/db/seeders/00002-users.js';
import {getAppModels} from './models.js';

export async function resetState() {
  const context = sequelize.getQueryInterface();
  const tables = getAppModels()
    .map(model => context.quoteIdentifier(model.tableName))
    .join(', ');
  await sequelize.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);

  await seedBaseline();

  await redis.flushdb();
  await Promise.all([roleCache.invalidateAll(), userCache.invalidateAll()]);
}

export async function seedBaseline() {
  const context = sequelize.getQueryInterface();
  await roleSeeder.up({context});
  await userSeeder.up({context});
}
