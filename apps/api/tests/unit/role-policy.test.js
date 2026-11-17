import {describe, expect, it} from 'vitest';
import {Permission} from '@repo/shared/constants/permission.js';
import {RolePolicy} from '../../src/lib/auth/role-policy.js';

const ADMIN = Permission.ADMIN;
const MANAGE_PEER = Permission.USER_MANAGE_PEER;

const roleMap = {
  boss: {id: 'boss', position: 3000, permissions: [ADMIN, MANAGE_PEER]},
  staff: {id: 'staff', position: 2000, permissions: [ADMIN]},
  intern: {id: 'intern', position: 1000, permissions: []},
};

const roster = [
  {id: 'boss', position: 3000},
  {id: 'staff', position: 2000},
  {id: 'intern', position: 1000},
];

const policyFor = (roleId, permissions) =>
  new RolePolicy(
    {
      id: 'actor',
      roles: [{id: roleId, position: roleMap[roleId].position}],
      permissions: permissions ?? roleMap[roleId].permissions,
    },
    roleMap,
  );

describe('granting permissions', () => {
  it('allows a subset of what the actor holds', () => {
    expect(policyFor('boss').canGrant([ADMIN])).toBe(true);
    expect(policyFor('staff').canGrant([ADMIN, MANAGE_PEER])).toBe(false);
  });

  it('refuses with wording that names the reason', () => {
    expect(policyFor('staff').assertCanGrant([MANAGE_PEER])).toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('izin'),
    });
    expect(policyFor('boss').assertCanGrant([ADMIN])).toBeNull();
  });

  it('judges a change by its difference, not by the whole set', () => {
    const staff = policyFor('staff');
    expect(
      staff.canChangeGrants([ADMIN, MANAGE_PEER], [ADMIN, MANAGE_PEER]),
    ).toBe(true);
    expect(staff.canChangeGrants([ADMIN, MANAGE_PEER], [ADMIN])).toBe(false);
    expect(staff.canChangeGrants([], [ADMIN])).toBe(true);
  });
});

describe('assigning roles', () => {
  it('refuses a role carrying a permission the actor lacks', () => {
    expect(policyFor('staff').canAssign(roleMap.boss)).toBe(false);
    expect(policyFor('boss').canAssign(roleMap.staff)).toBe(true);
  });

  it('refuses a role at or above the actor without the manage-peer permission', () => {
    expect(policyFor('staff', [ADMIN]).canAssign(roleMap.staff)).toBe(false);
    expect(
      policyFor('staff', [ADMIN, MANAGE_PEER]).canAssign(roleMap.staff),
    ).toBe(true);
  });

  it('allows assigning nothing', () => {
    expect(policyFor('intern').canAssignAll([])).toBe(true);
  });

  it('separates the two refusals so the user learns which rule stopped them', () => {
    expect(policyFor('staff').assertCanAssignAll([roleMap.boss])).toMatchObject(
      {message: expect.stringContaining('izinleri')},
    );
    expect(
      policyFor('staff', [ADMIN]).assertCanAssignAll([roleMap.staff]),
    ).toMatchObject({message: expect.stringContaining('seviyenizin')});
  });

  it('judges an assignment change by its difference', () => {
    const staff = policyFor('staff');
    expect(staff.canChangeAssignments([roleMap.boss], [roleMap.boss])).toBe(
      true,
    );
    expect(staff.canChangeAssignments([], [roleMap.boss])).toBe(false);
    expect(staff.canChangeAssignments([roleMap.boss], [])).toBe(false);
  });
});

describe('reach over positions', () => {
  it('reaches strictly below the actor', () => {
    const staff = policyFor('staff', [ADMIN]);
    expect(staff.canSetPosition(1999)).toBe(true);
    expect(staff.canSetPosition(2000)).toBe(false);
  });

  it('re-reads the actor position from the locked roster, not from the token', () => {
    const staff = policyFor('staff', [ADMIN]);
    const demoted = [{id: 'staff', position: 1000}];
    expect(staff.canSetPosition(1500)).toBe(true);
    expect(staff.canSetPosition(1500, demoted)).toBe(false);
  });

  it('treats an undefined position as nothing to check', () => {
    expect(policyFor('intern').assertCanSetPosition(undefined)).toBeNull();
  });
});

describe('managing a role', () => {
  it('refuses a locked role outright, whatever the actor holds', () => {
    const locked = {id: 'boss', position: 3000, isLocked: true};
    expect(policyFor('boss').canManage(locked)).toBe(false);
    expect(policyFor('boss').assertCanManage(locked)).toMatchObject({
      message: expect.stringContaining('Kilitli'),
    });
  });

  it('refuses a role at or above the actor', () => {
    const staff = policyFor('staff', [ADMIN]);
    expect(staff.canManage(roleMap.intern)).toBe(true);
    expect(staff.canManage(roleMap.staff)).toBe(false);
    expect(staff.canManage(roleMap.boss)).toBe(false);
  });
});

describe('abilities', () => {
  it('reads the same predicates the guards read', () => {
    const staff = policyFor('staff', [ADMIN]);
    const abilities = staff.getAbilities(roleMap.intern, roster);
    expect(abilities.update).toBe(staff.canManage(roleMap.intern));
    expect(abilities.delete).toBe(staff.canManage(roleMap.intern));
  });

  it('closes every action on a role out of reach', () => {
    const abilities = policyFor('staff', [ADMIN]).getAbilities(
      roleMap.boss,
      roster,
    );
    expect(abilities).toMatchObject({
      update: false,
      delete: false,
      moveUp: false,
      moveDown: false,
      addAbove: false,
      addSame: false,
    });
  });

  it('refuses to move a role up into the actor own level', () => {
    const staff = policyFor('staff', [ADMIN]);
    expect(staff.getAbilities(roleMap.intern, roster).moveUp).toBe(false);
  });

  it('refuses to move the topmost role up or the bottom role down', () => {
    const boss = policyFor('boss');
    expect(boss.getAbilities(roleMap.boss, roster).moveUp).toBe(false);
    expect(boss.getAbilities(roleMap.intern, roster).moveDown).toBe(false);
  });

  it('allows adding below a role the actor may itself hold', () => {
    const staff = policyFor('staff', [ADMIN]);
    expect(staff.getAbilities(roleMap.staff, roster).addBelow).toBe(true);
    expect(staff.getAbilities(roleMap.boss, roster).addBelow).toBe(false);
  });
});
