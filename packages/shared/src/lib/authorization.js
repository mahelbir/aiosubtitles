import {difference, uniq} from 'es-toolkit';
import {Permission} from '../constants/permission.js';

export function hasPermission(granted, required) {
  return Array.isArray(granted) && granted.includes(required);
}

export function hasPermissions(granted, required) {
  return (
    (required ?? []).length > 0 &&
    required.every(entry => hasPermission(granted, entry))
  );
}

export function hasAnyPermission(granted, required) {
  return (required ?? []).some(entry => hasPermission(granted, entry));
}

export function getPermissionsOfRoles(roles, roleMap) {
  return uniq(
    (roles ?? []).flatMap(role => roleMap?.[role.id]?.permissions ?? []),
  );
}

export function getMaxPosition(roles) {
  if (!roles?.length) {
    return -1;
  }
  return Math.max(...roles.map(role => role.position ?? 0));
}

export function getMaxManageablePosition(actor) {
  return getMaxPosition(actor?.roles) - 1;
}

export function canManagePosition(actor, position) {
  return isPositionInReach(position, getMaxManageablePosition(actor));
}

export function getMaxReachablePosition(actor) {
  return hasPermission(actor?.permissions, Permission.USER_MANAGE_PEER)
    ? getMaxPosition(actor?.roles)
    : getMaxManageablePosition(actor);
}

export function isPositionInReach(position, maxPosition) {
  return position <= maxPosition;
}

export function canAssignPosition(actor, position) {
  return isPositionInReach(position, getMaxReachablePosition(actor));
}

export function isSelf(actor, target) {
  if (!actor?.id || !target?.id) {
    return false;
  }
  return String(actor.id).toLowerCase() === String(target.id).toLowerCase();
}

export function canManageUser(actor, target, {self = false} = {}) {
  if (!actor || !target) {
    return false;
  }
  if (isSelf(actor, target)) {
    return Boolean(self);
  }
  return isPositionInReach(
    getMaxPosition(target.roles),
    getMaxReachablePosition(actor),
  );
}

export function canGrant(actor, permissions) {
  return difference(permissions ?? [], actor?.permissions ?? []).length === 0;
}
