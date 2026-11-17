import {
  WRITE_HOOKS,
  invalidateRecordsOn,
  invalidateWholeCacheOn,
} from '../../src/db/hooks/cache.js';
import {dbUtils} from '../../src/db/utils.js';
import {RedisCache} from '../../src/redis/cache.js';
import {FixtureRecord, FixtureRecordTag, FixtureTag} from './fixture-models.js';

const FIXTURE_CACHE_TTL = 60;

export const fixtureRecordCache = new RedisCache({
  prefix: 'fixture-record:',
  ttl: () => FIXTURE_CACHE_TTL,
  load: async recordId =>
    dbUtils.getPlain(
      await FixtureRecord.withScope('withTags').findByPk(recordId),
    ),
});

export const fixtureTagCache = new RedisCache({
  prefix: 'fixture-tags',
  ttl: () => FIXTURE_CACHE_TTL,
  load: () =>
    FixtureTag.findAll({attributes: ['id', 'label', 'rank'], raw: true}),
});

invalidateRecordsOn(FixtureRecord, fixtureRecordCache, {
  recordHooks: ['afterSave', 'afterDestroy'],
});
invalidateRecordsOn(FixtureRecordTag, fixtureRecordCache, {
  key: 'recordId',
  recordHooks: ['afterSave', 'afterDestroy'],
});
invalidateWholeCacheOn(FixtureTag, fixtureTagCache, WRITE_HOOKS);
