import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {PostgreSqlContainer} from '@testcontainers/postgresql';
import {RedisContainer} from '@testcontainers/redis';
import {noop} from 'es-toolkit';
import {getWorkspacePath} from '@repo/tooling/workspace.js';

const POSTGRES_IMAGE = 'postgres:17-alpine';
const REDIS_IMAGE = 'valkey/valkey:9-alpine';
const POSTGRES_PORT = 5432;
const REDIS_PORT = 6379;
const REDIS_PASSWORD = 'test';
const storagePrefix = `${path.basename(getWorkspacePath())}-test-`;

async function createStorage() {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), storagePrefix));
  await Promise.all([
    fs.mkdir(path.join(storagePath, 'private'), {recursive: true}),
    fs.mkdir(path.join(storagePath, 'public'), {recursive: true}),
  ]);
  return storagePath;
}

export async function startInfrastructure({env = {}} = {}) {
  const started = await Promise.allSettled([
    createStorage(),
    new PostgreSqlContainer(POSTGRES_IMAGE).start(),
    new RedisContainer(REDIS_IMAGE).withPassword(REDIS_PASSWORD).start(),
  ]);
  const [storagePath, postgres, redis] = started.map(({value}) => value);
  const teardown = async () => {
    await Promise.all([
      postgres?.stop(),
      redis?.stop(),
      storagePath && fs.rm(storagePath, {recursive: true, force: true}),
    ]);
  };

  try {
    const failure = started.find(({status}) => status === 'rejected');
    if (failure) {
      throw failure.reason;
    }

    /* Written before any application module is imported: under `test` the real
       environment outranks the env files, which is what points the app here. */
    Object.assign(process.env, {
      STORAGE_PATH: storagePath,
      DB_HOST: postgres.getHost(),
      DB_PORT: String(postgres.getMappedPort(POSTGRES_PORT)),
      DB_NAME: postgres.getDatabase(),
      DB_USER: postgres.getUsername(),
      DB_PASS: postgres.getPassword(),
      REDIS_HOST: redis.getHost(),
      REDIS_PORT: String(redis.getMappedPort(REDIS_PORT)),
      REDIS_USER: '',
      REDIS_PASS: redis.getPassword(),
      ...env,
    });

    const [{createMigrator}, {silentLogger}] = await Promise.all([
      import('../../src/db/cli/umzug.js'),
      import('./migrations.js'),
    ]);
    await createMigrator(silentLogger).up();
  } catch (error) {
    await teardown().catch(noop);
    throw error;
  }

  return {teardown};
}
