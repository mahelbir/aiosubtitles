import {describe, expect, it, vi} from 'vitest';
import {sequelize} from '../../src/db/index.js';
import {redis} from '../../src/redis/index.js';
import {RedisCache} from '../../src/redis/cache.js';
import {recordRedisCommands} from '../helpers/counters.js';
import {runConcurrently} from '../helpers/concurrency.js';
import {
  createFixtureRecord,
  createFixtureTag,
  toEmail,
} from '../helpers/factories.js';
import {fixtureRecordCache, fixtureTagCache} from '../helpers/fixture-cache.js';
import {
  FixtureRecord,
  FixtureRecordTag,
  FixtureTag,
} from '../helpers/fixture-models.js';

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

async function primeRecordCache(record) {
  await redis.flushdb();
  await fixtureRecordCache.get(record.id);
  expect(await fixtureRecordCache.peek(record.id)).toBeDefined();
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
    const record = await createFixtureRecord({name: toEmail('before')});
    await primeRecordCache(record);
    await record.update({name: toEmail('after')});
    expect((await fixtureRecordCache.get(record.id)).name).toBe(
      toEmail('after'),
    );
  });

  it('keeps serving the old value until the transaction commits', async () => {
    const record = await createFixtureRecord({name: toEmail('pre-commit')});
    await primeRecordCache(record);

    await sequelize.transaction(async transaction => {
      await record.update({name: toEmail('mid-commit')}, {transaction});
      const during = await fixtureRecordCache.get(record.id);
      expect(during.name).toBe(toEmail('pre-commit'));
    });

    expect((await fixtureRecordCache.get(record.id)).name).toBe(
      toEmail('mid-commit'),
    );
  });

  it('restores the cached value when the transaction rolls back', async () => {
    const record = await createFixtureRecord({name: toEmail('rolled-back')});
    await primeRecordCache(record);

    await expect(
      sequelize.transaction(async transaction => {
        await record.update({name: toEmail('never-lands')}, {transaction});
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect((await fixtureRecordCache.get(record.id)).name).toBe(
      toEmail('rolled-back'),
    );
  });

  it('drops the entry when the record is destroyed', async () => {
    const record = await createFixtureRecord({name: toEmail('destroyed')});
    await primeRecordCache(record);

    await record.destroy();

    expect(await fixtureRecordCache.get(record.id)).toBeNull();
  });

  it('drops only the entry a bulk update names, without a sweep', async () => {
    const record = await createFixtureRecord({name: toEmail('bulk-before')});
    await primeRecordCache(record);

    const commands = await recordRedisCommands(() =>
      FixtureRecord.update(
        {name: toEmail('bulk-after')},
        {where: {id: record.id}},
      ),
    );

    expect(commands).not.toContain('incr');
    expect((await fixtureRecordCache.get(record.id)).name).toBe(
      toEmail('bulk-after'),
    );
  });

  it('drops only the entry a bulk destroy names, without a sweep', async () => {
    const record = await createFixtureRecord({name: toEmail('bulk-destroyed')});
    await primeRecordCache(record);

    const commands = await recordRedisCommands(() =>
      FixtureRecord.destroy({where: {id: [record.id]}}),
    );

    expect(commands).not.toContain('incr');
    expect(await fixtureRecordCache.get(record.id)).toBeNull();
  });

  it('sweeps on a bulk write that names no record', async () => {
    const record = await createFixtureRecord({name: toEmail('swept-before')});
    await primeRecordCache(record);

    await FixtureRecord.update(
      {name: toEmail('swept-after')},
      {where: {name: toEmail('swept-before')}},
    );

    expect((await fixtureRecordCache.get(record.id)).name).toBe(
      toEmail('swept-after'),
    );
  });

  it('drops a holder’s entry when a tag is assigned to it', async () => {
    const tag = await createFixtureTag({label: 'granted', rank: 700});
    const holder = await createFixtureRecord({name: toEmail('granted')});
    await primeRecordCache(holder);

    await holder.addTags([tag.id]);

    expect(
      (await fixtureRecordCache.get(holder.id)).tags.map(({id}) => id),
    ).toEqual([tag.id]);
  });

  it('drops a holder’s entry when a tag is taken from it', async () => {
    const tag = await createFixtureTag({label: 'revoked', rank: 700});
    const holder = await createFixtureRecord({
      name: toEmail('revoked'),
      tags: [tag],
    });
    await primeRecordCache(holder);

    await holder.removeTags([tag.id]);

    expect((await fixtureRecordCache.get(holder.id)).tags).toEqual([]);
  });

  it('drops a holder’s entry when a bulk update moves its assignment', async () => {
    const from = await createFixtureTag({label: 'moved-from', rank: 700});
    const to = await createFixtureTag({label: 'moved-to', rank: 600});
    const holder = await createFixtureRecord({
      name: toEmail('moved'),
      tags: [from],
    });
    await primeRecordCache(holder);

    await FixtureRecordTag.update(
      {tagId: to.id},
      {where: {recordId: holder.id}},
    );

    expect(
      (await fixtureRecordCache.get(holder.id)).tags.map(({id}) => id),
    ).toEqual([to.id]);
  });

  it('drops a whole-list cache on every write to its model', async () => {
    await createFixtureTag({label: 'listed', rank: 100});
    expect(await fixtureTagCache.get()).toHaveLength(1);

    await createFixtureTag({label: 'added', rank: 200});

    expect(await fixtureTagCache.get()).toHaveLength(2);
  });

  it('defers a whole-list drop until the transaction commits', async () => {
    const tag = await createFixtureTag({label: 'kept', rank: 100});
    expect(await fixtureTagCache.get()).toHaveLength(1);

    await sequelize.transaction(async transaction => {
      await FixtureTag.destroy({where: {id: tag.id}, transaction});
      expect(await fixtureTagCache.get()).toHaveLength(1);
    });

    expect(await fixtureTagCache.get()).toEqual([]);
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
