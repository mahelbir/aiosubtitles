import pino from 'pino';
import {describe, expect, it} from 'vitest';
import {roleCache} from '../../src/lib/auth/role-cache.js';
import {userCache} from '../../src/lib/user-cache.js';
import {readPastMemoWindow} from '../helpers/cache.js';
import {runCliScript} from '../helpers/cli.js';
import {getSeededAdminUser} from '../helpers/factories.js';

const SEED_MOCK_URL = new URL(
  '../../src/db/cli/seed-mock.dev.js',
  import.meta.url,
);

function peekCaches(userId) {
  return readPastMemoWindow(() =>
    Promise.all([roleCache.peek(), userCache.peek(userId)]),
  );
}

describe('mock data seeder', () => {
  it('refuses to run in production, before it connects', async () => {
    const {exitCode, messages} = await runCliScript(SEED_MOCK_URL, {
      env: {NODE_ENV: 'production'},
    });

    expect(exitCode).toBe(1);
    expect(messages).toEqual(['Mock data is never seeded in production']);
  });

  it('seeds outside production without a warning', async () => {
    const {exitCode, logs} = await runCliScript(SEED_MOCK_URL);

    expect(exitCode).toBe(0);
    expect(logs.filter(({level}) => level >= pino.levels.values.warn)).toEqual(
      [],
    );
  });

  it('drops the role and user caches', async () => {
    const admin = await getSeededAdminUser();
    await Promise.all([roleCache.get(), userCache.get(admin.id)]);
    const [cachedRoles, cachedUser] = await peekCaches(admin.id);
    expect(cachedRoles).toBeDefined();
    expect(cachedUser).toBeDefined();

    await runCliScript(SEED_MOCK_URL);

    expect(await peekCaches(admin.id)).toEqual([undefined, undefined]);
  });
});
