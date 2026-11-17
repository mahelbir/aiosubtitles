import {describe, expect, it} from 'vitest';
import {Permission} from '../src/constants/permission.js';
import {ROLE_POSITION_MIN} from '../src/constants/role.js';
import {
  canAssignPosition,
  canGrant,
  canManagePosition,
  canManageUser,
  getMaxManageablePosition,
  getMaxPosition,
  getMaxReachablePosition,
  isPositionInReach,
  getPermissionsOfRoles,
  hasAnyPermission,
  hasPermission,
  hasPermissions,
  isSelf,
} from '../src/lib/authorization.js';

const ADMIN = Permission.ADMIN;
const MANAGE_PEER = Permission.USER_MANAGE_PEER;

const actorAt = (position, permissions = []) => ({
  id: 'a1',
  roles: [{id: 'r1', position}],
  permissions,
});

describe('hasPermission', () => {
  it('accepts a granted entry', () => {
    expect(hasPermission([ADMIN], ADMIN)).toBe(true);
  });

  it.each([
    ['missing entry', [MANAGE_PEER], ADMIN],
    ['empty grant', [], ADMIN],
    ['null grant', null, ADMIN],
    ['undefined grant', undefined, ADMIN],
    ['non-array grant', ADMIN, ADMIN],
  ])('refuses on %s', (_label, granted, required) => {
    expect(hasPermission(granted, required)).toBe(false);
  });
});

describe('hasPermissions', () => {
  it('requires every entry', () => {
    expect(hasPermissions([ADMIN, MANAGE_PEER], [ADMIN, MANAGE_PEER])).toBe(
      true,
    );
    expect(hasPermissions([ADMIN], [ADMIN, MANAGE_PEER])).toBe(false);
  });

  it('refuses an empty requirement rather than passing vacuously', () => {
    expect(hasPermissions([ADMIN], [])).toBe(false);
    expect(hasPermissions([ADMIN], null)).toBe(false);
  });
});

describe('hasAnyPermission', () => {
  it('accepts when one entry matches', () => {
    expect(hasAnyPermission([MANAGE_PEER], [ADMIN, MANAGE_PEER])).toBe(true);
  });

  it('refuses an empty requirement', () => {
    expect(hasAnyPermission([ADMIN], [])).toBe(false);
    expect(hasAnyPermission([ADMIN], null)).toBe(false);
  });
});

describe('getPermissionsOfRoles', () => {
  const roleMap = {
    r1: {permissions: [ADMIN, MANAGE_PEER]},
    r2: {permissions: [ADMIN]},
  };

  it('unions the roles and deduplicates', () => {
    const granted = getPermissionsOfRoles([{id: 'r1'}, {id: 'r2'}], roleMap);
    expect(granted.toSorted()).toEqual([ADMIN, MANAGE_PEER].toSorted());
  });

  it('ignores a role the map does not know', () => {
    expect(getPermissionsOfRoles([{id: 'gone'}], roleMap)).toEqual([]);
  });

  it('tolerates a missing roles list or map', () => {
    expect(getPermissionsOfRoles(null, roleMap)).toEqual([]);
    expect(getPermissionsOfRoles([{id: 'r1'}], null)).toEqual([]);
  });
});

describe('getMaxPosition', () => {
  it('returns the highest position held', () => {
    expect(getMaxPosition([{position: 10}, {position: 40}])).toBe(40);
  });

  it('treats a role with no position as zero', () => {
    expect(getMaxPosition([{}])).toBe(0);
  });

  it('returns -1 when there are no roles, so a role-less actor loses to everyone', () => {
    expect(getMaxPosition([])).toBe(-1);
    expect(getMaxPosition(null)).toBe(-1);
  });
});

describe('position reach', () => {
  it('sits strictly one step below the actor by default', () => {
    expect(getMaxManageablePosition(actorAt(1000))).toBe(999);
  });

  it('refuses the actor its own level', () => {
    expect(canManagePosition(actorAt(1000), 1000)).toBe(false);
    expect(canManagePosition(actorAt(1000), 999)).toBe(true);
  });

  it('opens the own level only through the dedicated permission', () => {
    expect(canAssignPosition(actorAt(1000), 1000)).toBe(false);
    expect(canAssignPosition(actorAt(1000, [MANAGE_PEER]), 1000)).toBe(true);
  });

  it('never reaches above the actor, permission or not', () => {
    expect(canAssignPosition(actorAt(1000, [MANAGE_PEER]), 1001)).toBe(false);
  });

  it('counts the bound itself as within reach, and nothing past it', () => {
    expect(isPositionInReach(999, 1000)).toBe(true);
    expect(isPositionInReach(1000, 1000)).toBe(true);
    expect(isPositionInReach(1001, 1000)).toBe(false);
  });

  it('reports the reach as one step below the actor by default', () => {
    expect(getMaxReachablePosition(actorAt(1000))).toBe(999);
  });

  it('reports the reach as the actor own level with the dedicated permission', () => {
    expect(getMaxReachablePosition(actorAt(1000, [MANAGE_PEER]))).toBe(1000);
  });

  it('leaves a role-less actor beneath every real position', () => {
    expect(getMaxReachablePosition({id: 'a'})).toBeLessThan(ROLE_POSITION_MIN);
  });
});

describe('isSelf', () => {
  it('compares ids case-insensitively', () => {
    expect(isSelf({id: 'AB-CD'}, {id: 'ab-cd'})).toBe(true);
  });

  it('refuses when either id is missing', () => {
    expect(isSelf({id: 'a'}, {})).toBe(false);
    expect(isSelf(null, {id: 'a'})).toBe(false);
  });
});

describe('canManageUser', () => {
  const target = position => ({id: 't1', roles: [{id: 'r9', position}]});

  it('requires the actor strictly above the target', () => {
    expect(canManageUser(actorAt(1000), target(999))).toBe(true);
    expect(canManageUser(actorAt(1000), target(1000))).toBe(false);
    expect(canManageUser(actorAt(1000), target(1001))).toBe(false);
  });

  it('admits the same level only with the dedicated permission', () => {
    expect(canManageUser(actorAt(1000, [MANAGE_PEER]), target(1000))).toBe(
      true,
    );
    expect(canManageUser(actorAt(1000, [MANAGE_PEER]), target(1001))).toBe(
      false,
    );
  });

  it('treats the actor itself as a separate decision', () => {
    const actor = actorAt(1000);
    expect(canManageUser(actor, actor)).toBe(false);
    expect(canManageUser(actor, actor, {self: true})).toBe(true);
  });

  it('refuses when either side is missing', () => {
    expect(canManageUser(null, target(1))).toBe(false);
    expect(canManageUser(actorAt(1000), null)).toBe(false);
  });
});

describe('canGrant', () => {
  it('allows only a subset of what the actor holds', () => {
    expect(canGrant(actorAt(1, [ADMIN, MANAGE_PEER]), [ADMIN])).toBe(true);
    expect(canGrant(actorAt(1, [ADMIN]), [ADMIN, MANAGE_PEER])).toBe(false);
  });

  it('allows granting nothing', () => {
    expect(canGrant(actorAt(1, []), [])).toBe(true);
    expect(canGrant(actorAt(1, []), null)).toBe(true);
  });
});
