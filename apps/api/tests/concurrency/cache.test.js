import {describe, expect, it, vi} from 'vitest';
import {sequelize} from '../../src/db/index.js';
import {redis} from '../../src/redis/index.js';
import {RedisCache} from '../../src/redis/cache.js';
import {userCache} from '../../src/lib/user-cache.js';
import {Role} from '../../src/db/models/role.js';
import {User} from '../../src/db/models/user.js';
import {UserRole} from '../../src/db/models/user-role.js';
import {recordRedisCommands} from '../helpers/counters.js';
import {runConcurrently} from '../helpers/concurrency.js';
import {createRole, createUser, toEmail} from '../helpers/factories.js';

const FIXTURE_PREFIX = 'fixture:race:';
const FIXTURE_TTL = 60;
const FIXTURE_SUBJECT = 'subject';

function createFixtureCache(load, {memo = false} = {}) {
  return new RedisCache({
    prefix: FIXTURE_PREFIX,
    ttl: () => FIXTURE_TTL,
    load,
    memo,
  });
}

async function fillAcrossInvalidation(invalidate, {before, after}) {
  const source = {value: before};
  const loaded = Promise.withResolvers();
  const released = Promise.withResolvers();
  const load = vi.fn(async () => source.value);
  load.mockImplementationOnce(async () => {
    const snapshot = source.value;
    loaded.resolve();
    await released.promise;
    return snapshot;
  });
  const cache = createFixtureCache(load);

  const racing = cache.get(FIXTURE_SUBJECT);
  await loaded.promise;
  source.value = after;
  await invalidate(cache);
  released.resolve();
  await racing;

  return {cache, load};
}

async function primeUserCache(user) {
  await redis.flushdb();
  await userCache.get(user.id);
  expect(await userCache.peek(user.id)).toBeDefined();
}

describe('single flight', () => {
  it('loads once however many readers arrive together', async () => {
    const load = vi.fn(async () => 'value');
    const cache = createFixtureCache(load);
    await runConcurrently(8, () => cache.get(FIXTURE_SUBJECT));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('hands every reader the same value', async () => {
    const cache = createFixtureCache(async () => ({label: 'shared'}));
    const results = await runConcurrently(8, () => cache.get(FIXTURE_SUBJECT));
    for (const result of results) {
      expect(result).toEqual({label: 'shared'});
    }
  });

  it('keeps reading through while the write tombstone stands', async () => {
    const load = vi.fn(async () => 'value');
    const cache = createFixtureCache(load);
    await cache.invalidate(FIXTURE_SUBJECT);
    await cache.get(FIXTURE_SUBJECT);
    await cache.get(FIXTURE_SUBJECT);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('serves the repeat read from cache once the tombstone is gone', async () => {
    const load = vi.fn(async () => 'value');
    const cache = createFixtureCache(load);
    await cache.invalidate(FIXTURE_SUBJECT);
    await redis.flushdb();
    await cache.get(FIXTURE_SUBJECT);
    await cache.get(FIXTURE_SUBJECT);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('returns null for a subject that does not exist', async () => {
    const cache = createFixtureCache(async () => null);
    expect(await cache.get(FIXTURE_SUBJECT)).toBeNull();
  });

  it('caches that absence, so a missing subject cannot re-query', async () => {
    const load = vi.fn(async () => null);
    const cache = createFixtureCache(load);
    await cache.get(FIXTURE_SUBJECT);
    await cache.get(FIXTURE_SUBJECT);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('invalidation', () => {
  it('drops the entry so the next read sees the write', async () => {
    const user = await createUser({email: toEmail('before')});
    await primeUserCache(user);
    await user.update({email: toEmail('after')});
    expect((await userCache.get(user.id)).email).toBe(toEmail('after'));
  });

  it('keeps serving the old value until the transaction commits', async () => {
    const user = await createUser({email: toEmail('pre-commit')});
    await primeUserCache(user);

    await sequelize.transaction(async transaction => {
      await user.update({email: toEmail('mid-commit')}, {transaction});
      const during = await userCache.get(user.id);
      expect(during.email).toBe(toEmail('pre-commit'));
    });

    expect((await userCache.get(user.id)).email).toBe(toEmail('mid-commit'));
  });

  it('restores the cached value when the transaction rolls back', async () => {
    const user = await createUser({email: toEmail('rolled-back')});
    await primeUserCache(user);

    await expect(
      sequelize.transaction(async transaction => {
        await user.update({email: toEmail('never-lands')}, {transaction});
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect((await userCache.get(user.id)).email).toBe(toEmail('rolled-back'));
  });

  it('drops the entry when the record is destroyed', async () => {
    const user = await createUser({email: toEmail('destroyed')});
    await primeUserCache(user);

    await user.destroy();

    expect(await userCache.get(user.id)).toBeNull();
  });

  it('drops only the entry a bulk update names, without a sweep', async () => {
    const user = await createUser({email: toEmail('bulk-before')});
    await primeUserCache(user);

    const commands = await recordRedisCommands(() =>
      User.update({email: toEmail('bulk-after')}, {where: {id: user.id}}),
    );

    expect(commands).not.toContain('incr');
    expect((await userCache.get(user.id)).email).toBe(toEmail('bulk-after'));
  });

  it('drops only the entry a bulk destroy names, without a sweep', async () => {
    const user = await createUser({email: toEmail('bulk-destroyed')});
    await primeUserCache(user);

    const commands = await recordRedisCommands(() =>
      User.destroy({where: {id: [user.id]}}),
    );

    expect(commands).not.toContain('incr');
    expect(await userCache.get(user.id)).toBeNull();
  });

  it('sweeps on a bulk write that names no record', async () => {
    const user = await createUser({email: toEmail('swept-before')});
    await primeUserCache(user);

    await User.update(
      {email: toEmail('swept-after')},
      {where: {email: toEmail('swept-before')}},
    );

    expect((await userCache.get(user.id)).email).toBe(toEmail('swept-after'));
  });

  it('reaches every holder of a role when the role itself changes', async () => {
    const role = await createRole({slug: 'shifting', position: 700});
    const holder = await createUser({email: toEmail('holder'), roles: [role]});
    await primeUserCache(holder);
    expect((await userCache.get(holder.id)).roles[0].position).toBe(700);

    await Role.update({position: 800}, {where: {id: role.id}});

    expect((await userCache.get(holder.id)).roles[0].position).toBe(800);
  });

  it('drops a holder’s entry when a role is assigned to it', async () => {
    const role = await createRole({slug: 'granted', position: 700});
    const holder = await createUser({email: toEmail('granted')});
    await primeUserCache(holder);

    await holder.addRoles([role.id]);

    expect((await userCache.get(holder.id)).roles.map(({id}) => id)).toEqual([
      role.id,
    ]);
  });

  it('drops a holder’s entry when a role is taken from it', async () => {
    const role = await createRole({slug: 'revoked', position: 700});
    const holder = await createUser({email: toEmail('revoked'), roles: [role]});
    await primeUserCache(holder);

    await holder.removeRoles([role.id]);

    expect((await userCache.get(holder.id)).roles).toEqual([]);
  });

  it('drops a holder’s entry when a bulk update moves its assignment', async () => {
    const from = await createRole({slug: 'moved-from', position: 700});
    const to = await createRole({slug: 'moved-to', position: 600});
    const holder = await createUser({email: toEmail('moved'), roles: [from]});
    await primeUserCache(holder);

    await UserRole.update({roleId: to.id}, {where: {userId: holder.id}});

    expect((await userCache.get(holder.id)).roles.map(({id}) => id)).toEqual([
      to.id,
    ]);
  });
});

describe.each([
  ['a sweep', cache => cache.invalidateAll()],
  ['a per-key invalidation', cache => cache.invalidate(FIXTURE_SUBJECT)],
])('%s racing a fill on an absent key', (_name, invalidate) => {
  it('keeps the value read before it from landing', async () => {
    const {cache, load} = await fillAcrossInvalidation(invalidate, {
      before: 'stale',
      after: 'fresh',
    });
    expect(await cache.get(FIXTURE_SUBJECT)).toBe('fresh');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps an absence read before it from landing', async () => {
    const {cache} = await fillAcrossInvalidation(invalidate, {
      before: null,
      after: 'created',
    });
    expect(await cache.get(FIXTURE_SUBJECT)).toBe('created');
  });
});

describe('a sweep', () => {
  it('leaves every later fill caching as usual', async () => {
    const load = vi.fn(async () => 'value');
    const cache = createFixtureCache(load);
    await cache.invalidateAll();
    await cache.invalidateAll();
    await cache.get(FIXTURE_SUBJECT);
    expect(await cache.get(FIXTURE_SUBJECT)).toBe('value');
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('the memo tier', () => {
  it('answers a repeat read without a round trip', async () => {
    const load = vi.fn(async () => 'value');
    const cache = createFixtureCache(load, {memo: true});
    await cache.get(FIXTURE_SUBJECT);
    await cache.get(FIXTURE_SUBJECT);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('spares Redis too, however many readers arrive at once', async () => {
    const cache = createFixtureCache(async () => 'value', {memo: true});
    await cache.get(FIXTURE_SUBJECT);
    const commands = await recordRedisCommands(() =>
      runConcurrently(100, () => cache.get(FIXTURE_SUBJECT)),
    );
    expect(commands.filter(name => name === 'get')).toHaveLength(0);
  });

  it('is cleared by an invalidation, so a stale value cannot outlive the write', async () => {
    const source = {value: 'before'};
    const cache = createFixtureCache(async () => source.value, {memo: true});
    expect(await cache.get(FIXTURE_SUBJECT)).toBe('before');
    source.value = 'after';
    await cache.invalidate(FIXTURE_SUBJECT);
    expect(await cache.get(FIXTURE_SUBJECT)).toBe('after');
  });

  it('hands back a frozen value, so one reader cannot corrupt another', async () => {
    const cache = createFixtureCache(async () => ({entry: {permissions: []}}), {
      memo: true,
    });
    const value = await cache.get(FIXTURE_SUBJECT);
    expect(Object.isFrozen(value)).toBe(true);
    expect(() => {
      value.entry.permissions.push('smuggled');
    }).toThrow();
  });
});

describe('peek', () => {
  it('never loads on a cold cache', async () => {
    const load = vi.fn(async () => 'value');
    const cache = createFixtureCache(load);
    await cache.peek(FIXTURE_SUBJECT);
    expect(load).not.toHaveBeenCalled();
  });

  it('returns undefined while nothing is cached', async () => {
    const cache = createFixtureCache(async () => 'value');
    expect(await cache.peek(FIXTURE_SUBJECT)).toBeUndefined();
  });

  it('serves the warmed value without loading again', async () => {
    const load = vi.fn(async () => 'value');
    const cache = createFixtureCache(load);
    await cache.get(FIXTURE_SUBJECT);
    expect(await cache.peek(FIXTURE_SUBJECT)).toBe('value');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps a cached absence as null, telling it apart from an unknown', async () => {
    const cache = createFixtureCache(async () => null);
    await cache.get(FIXTURE_SUBJECT);
    expect(await cache.peek(FIXTURE_SUBJECT)).toBeNull();
  });

  it('falls back to the default value only when nothing is known', async () => {
    const cache = createFixtureCache(async () => null);
    expect(await cache.peek(FIXTURE_SUBJECT, 'fallback')).toBe('fallback');
    await cache.get(FIXTURE_SUBJECT);
    expect(await cache.peek(FIXTURE_SUBJECT, 'fallback')).toBeNull();
  });
});
