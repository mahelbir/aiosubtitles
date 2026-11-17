import {orderBy} from 'es-toolkit';
import {deepFreeze} from 'melperjs';
import {isPositionInReach} from '@repo/shared/lib/authorization.js';
import {Role} from '../../db/models/role.js';
import {roleCache} from './role-cache.js';
import {rolePosition} from './role-position.js';

export const ROSTER_ORDER = deepFreeze([
  ['position', 'DESC'],
  ['id', 'ASC'],
]);

const ROSTER_KEYS = ROSTER_ORDER.map(([field]) => field);
const ROSTER_DIRECTIONS = ROSTER_ORDER.map(([, direction]) =>
  direction.toLowerCase(),
);

function sortRoster(roles) {
  return orderBy(roles, ROSTER_KEYS, ROSTER_DIRECTIONS);
}

export async function getCachedRoster() {
  const roleMap = await roleCache.get();
  return rolePosition.withRanks(sortRoster(Object.values(roleMap ?? {})));
}

export function toVisibleRoster(roster, {maxPosition}) {
  return roster.filter(role => isPositionInReach(role.position, maxPosition));
}

export async function getWriteRoster(transaction = null, lock = false) {
  const options = {
    attributes: ['id', 'position', 'isLocked'],
    order: ROSTER_ORDER,
    raw: true,
  };
  const roles = lock
    ? await Role.findAllLocked(options, transaction)
    : await Role.findAll({...options, transaction});
  return rolePosition.withRanks(roles);
}
