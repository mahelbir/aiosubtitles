import {Op} from 'sequelize';
import {uniq} from 'es-toolkit';
import {userConfigCache} from '../../lib/user-config-cache.js';
import {UserConfig} from '../models/user-config.js';
import {UserConfigCredential} from '../models/user-config-credential.js';

/* Hooks fire while the statement runs, so a write inside a transaction must defer
   its invalidation to commit — otherwise a concurrent read repopulates the cache
   from the pre-commit row and the stale value outlives the write. */
function afterCommit(options, run) {
  if (options?.transaction) {
    options.transaction.afterCommit(() => run());
    return undefined;
  }
  return run();
}

/* Bulk hooks receive the `where`, never the affected rows. A clause that does not
   name its keys is unresolvable — sweep rather than invalidate nothing. A clause
   Sequelize wrote itself, as the association mixins do, spells the physical
   column, so the attribute alone would miss it and sweep every time. */
function idsFrom(where, model, attribute) {
  const value =
    where?.[attribute] ?? where?.[model.getAttributes()[attribute].field];
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return Array.isArray(value?.[Op.in]) ? value[Op.in] : null;
}

const MAX_INVALIDATION_FANOUT = 1000;

export const WRITE_HOOKS = [
  'afterCreate',
  'afterDestroy',
  'afterBulkCreate',
  'afterBulkDestroy',
];

export function invalidateWholeCacheOn(model, cache, hooks) {
  for (const hook of hooks) {
    model.addHook(hook, (...args) =>
      afterCommit(args.at(-1), () => cache.invalidate()),
    );
  }
}

function invalidateIds(cache, ids) {
  if (!ids) {
    return cache.invalidateAll();
  }
  const unique = uniq(ids);
  return unique.length > MAX_INVALIDATION_FANOUT
    ? cache.invalidateAll()
    : cache.invalidateMany(unique);
}

function invalidateRecord(cache, id) {
  return id == null ? cache.invalidateAll() : cache.invalidate(id);
}

export function invalidateRecordsOn(model, cache, {key = 'id', recordHooks}) {
  const storedKeys = new WeakMap();
  for (const hook of recordHooks) {
    model.addHook(hook.replace(/^after/, 'before'), async (record, options) => {
      if (record[key] != null) {
        return;
      }
      const stored = await model.unscoped().findOne({
        attributes: [key],
        where: record.where(),
        transaction: options?.transaction,
        raw: true,
      });
      storedKeys.set(record, stored?.[key]);
    });
    model.addHook(hook, (record, options) =>
      afterCommit(options, () =>
        invalidateRecord(cache, record[key] ?? storedKeys.get(record)),
      ),
    );
  }
  model.addHook('afterBulkCreate', (records, options) =>
    afterCommit(options, () =>
      invalidateIds(
        cache,
        records.map(record => record[key]),
      ),
    ),
  );
  for (const hook of ['afterBulkUpdate', 'afterBulkDestroy']) {
    model.addHook(hook, options =>
      afterCommit(options, () =>
        invalidateIds(cache, idsFrom(options.where, model, key)),
      ),
    );
  }
}

export function applyCacheHooks() {
  invalidateRecordsOn(UserConfig, userConfigCache, {
    recordHooks: ['afterUpdate', 'afterDestroy'],
  });
  invalidateRecordsOn(UserConfigCredential, userConfigCache, {
    key: 'userConfigId',
    recordHooks: ['afterSave', 'afterDestroy'],
  });
}
