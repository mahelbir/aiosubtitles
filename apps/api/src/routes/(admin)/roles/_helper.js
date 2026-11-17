import {difference} from 'es-toolkit';
import {ROLE_POSITION_MAX} from '@repo/shared/constants/role.js';
import {isPositionInReach} from '@repo/shared/lib/authorization.js';
import {Role} from '../../../db/models/role.js';
import {RolePermission} from '../../../db/models/role-permission.js';
import {dbUtils} from '../../../db/utils.js';
import {rolePosition} from '../../../lib/auth/role-position.js';
import {getWriteRoster} from '../../../lib/auth/role-roster.js';
import {unprocessable} from '../../../lib/errors.js';

export function toRoleJson(role, policy, roster) {
  const json = dbUtils.getPlain(role);
  const entry = roster?.find(item => item.id === json.id);
  json.rank = entry?.rank ?? null;
  json.viewerCan = policy.getAbilities(json, roster);
  return json;
}

export function toRoleDetailJson(role, policy, roster) {
  const json = toRoleJson(role, policy, roster);
  return {
    ...json,
    ...rolePosition.currentPlacement(roster ?? [], json),
    permissions: (json.permissions ?? []).map(entry => entry.permission),
  };
}

export async function setPermissions(
  {roleId, current = [], next},
  transaction,
) {
  const removed = difference(current, next);
  const added = difference(next, current);
  if (removed.length > 0) {
    await RolePermission.destroy({
      where: {roleId, permission: removed},
      transaction,
    });
  }
  if (added.length > 0) {
    await RolePermission.bulkCreate(
      added.map(permission => ({roleId, permission})),
      {transaction},
    );
  }
}

async function rebalancePositions(roster, transaction) {
  const plan = rolePosition.rebalancePlan(roster);
  if (plan.length === 0) {
    return roster;
  }
  if (plan.at(-1).position > ROLE_POSITION_MAX) {
    return null;
  }
  await Role.update(
    {
      position: dbUtils.caseMap(
        {keyAttribute: 'id', valueAttribute: 'position', rows: plan},
        Role,
      ),
    },
    {where: {id: dbUtils.getIds(plan)}, transaction},
  );
  return getWriteRoster(transaction);
}

function pickPosition(bounds) {
  if (!bounds) {
    return null;
  }
  return (
    bounds.exact ?? rolePosition.positionBetween(bounds.lower, bounds.upper)
  );
}

async function allocate(getBounds, message, transaction) {
  let roster = await getWriteRoster(transaction, true);
  const bounds = getBounds(roster);
  if (!bounds) {
    return {error: unprocessable(message)};
  }
  let position = pickPosition(bounds);
  if (position === null) {
    roster = await rebalancePositions(roster, transaction);
    position = roster === null ? null : pickPosition(getBounds(roster));
  }
  if (position === null) {
    return {error: unprocessable('Sıra için yer açılamadı.')};
  }
  return {position, roster};
}

export function allocateByPlacement(
  {anchorRoleId, placement, excludeRoleId, maxPosition, message},
  transaction,
) {
  const getBounds = roster => {
    const anchor = roster.find(role => role.id === anchorRoleId);
    if (
      anchorRoleId &&
      !(anchor && isPositionInReach(anchor.position, maxPosition))
    ) {
      return null;
    }
    const scope = excludeRoleId
      ? roster.filter(role => role.id !== excludeRoleId)
      : roster;
    return rolePosition.placementBounds(
      scope,
      scope.find(role => role.id === anchorRoleId),
      placement,
    );
  };
  return allocate(getBounds, message, transaction);
}

export function allocateByMove({roleId, direction, message}, transaction) {
  return allocate(
    roster => rolePosition.moveBounds(roster, roleId, direction),
    message,
    transaction,
  );
}
