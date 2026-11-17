import {Op} from 'sequelize';
import {uniq} from 'es-toolkit';
import {roleCache} from '../../lib/auth/role-cache.js';
import {userCache} from '../../lib/user-cache.js';
import {Role} from '../models/role.js';
import {RolePermission} from '../models/role-permission.js';
import {User} from '../models/user.js';
import {UserRole} from '../models/user-role.js';

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

const WRITE_HOOKS = [
  'afterCreate',
  'afterDestroy',
  'afterBulkCreate',
  'afterBulkDestroy',
];

function invalidateRolesOn(model, hooks) {
  for (const hook of hooks) {
    model.addHook(hook, (...args) =>
      afterCommit(args.at(-1), () => roleCache.invalidate()),
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

function invalidateRecordsOn(model, cache, {key = 'id', recordHooks}) {
  for (const hook of recordHooks) {
    model.addHook(hook, (record, options) =>
      afterCommit(options, () => cache.invalidate(record[key])),
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

function invalidateRoleWrite(roleIds) {
  return Promise.all([invalidateUsersOfRoles(roleIds), roleCache.invalidate()]);
}

async function invalidateUsersOfRoles(roleIds) {
  if (!roleIds) {
    return userCache.invalidateAll();
  }
  const assignments = await UserRole.findAll({
    where: {roleId: {[Op.in]: roleIds}},
    attributes: ['userId'],
    limit: MAX_INVALIDATION_FANOUT + 1,
    raw: true,
  });
  return assignments.length > MAX_INVALIDATION_FANOUT
    ? userCache.invalidateAll()
    : invalidateIds(
        userCache,
        assignments.map(row => row.userId),
      );
}

export function applyCacheHooks() {
  invalidateRecordsOn(User, userCache, {
    recordHooks: ['afterSave', 'afterDestroy'],
  });
  invalidateRecordsOn(UserRole, userCache, {
    key: 'userId',
    recordHooks: ['afterSave', 'afterDestroy'],
  });

  for (const hook of ['afterUpdate', 'afterDestroy']) {
    Role.addHook(hook, (role, options) =>
      afterCommit(options, () => invalidateRoleWrite([role.id])),
    );
  }
  for (const hook of ['afterBulkUpdate', 'afterBulkDestroy']) {
    Role.addHook(hook, options =>
      afterCommit(options, () =>
        invalidateRoleWrite(idsFrom(options.where, Role, 'id')),
      ),
    );
  }

  invalidateRolesOn(Role, ['afterCreate', 'afterBulkCreate']);
  invalidateRolesOn(RolePermission, WRITE_HOOKS);
}
