import {describe, expect, it} from 'vitest';
import {Permission} from '@repo/shared/constants/permission.js';
import {UserPolicy} from '../../src/lib/auth/user-policy.js';

const MANAGE_PEER = Permission.USER_MANAGE_PEER;

const roleMap = {
  boss: {id: 'boss', position: 3000, permissions: []},
  staff: {id: 'staff', position: 2000, permissions: []},
  intern: {id: 'intern', position: 1000, permissions: []},
};

const actor = (id, roleId, permissions = []) => ({
  id,
  roles: [{id: roleId, position: roleMap[roleId].position}],
  permissions,
});

/* Positions travel on the row, permissions through the role map — so a query
   that forgets to select `position` makes every target look like the floor. */
const target = (id, roleId, position) => ({
  id,
  roles: roleId
    ? [{id: roleId, position: position ?? roleMap[roleId]?.position}]
    : [],
});

const policyFor = principal => new UserPolicy(principal, roleMap);

describe('canManage', () => {
  it('requires the actor strictly above the target', () => {
    const policy = policyFor(actor('me', 'staff'));
    expect(policy.canManage(target('them', 'intern'))).toBe(true);
    expect(policy.canManage(target('them', 'staff'))).toBe(false);
    expect(policy.canManage(target('them', 'boss'))).toBe(false);
  });

  it('opens the same level only through the dedicated permission', () => {
    const policy = policyFor(actor('me', 'staff', [MANAGE_PEER]));
    expect(policy.canManage(target('them', 'staff'))).toBe(true);
    expect(policy.canManage(target('them', 'boss'))).toBe(false);
  });

  it('reaches a role-less user from any level', () => {
    const policy = policyFor(actor('me', 'intern'));
    expect(policy.canManage(target('them', null))).toBe(true);
  });

  it('treats the actor itself as a separate decision', () => {
    const principal = actor('me', 'staff');
    const policy = policyFor(principal);
    expect(policy.canManage(target('me', 'staff'))).toBe(false);
    expect(policy.canManage(target('me', 'staff'), {self: true})).toBe(true);
  });

  it('takes the target position from the row, not from the role map', () => {
    const policy = policyFor(actor('me', 'staff'));
    expect(policy.canManage(target('them', 'intern', 9000))).toBe(false);
  });

  it('reads a role the map does not know as carrying no permissions', () => {
    const policy = policyFor(actor('me', 'staff'));
    expect(policy.canManage(target('them', 'unknown-role', 1000))).toBe(true);
  });

  it('reads a role list with no positions as the floor, which is the sharp edge', () => {
    const policy = policyFor(actor('me', 'intern'));
    expect(policy.canManage({id: 'them', roles: [{id: 'boss'}]})).toBe(true);
  });

  it('throws rather than guessing when the target has no id', () => {
    const policy = policyFor(actor('me', 'staff'));
    expect(() => policy.canManage({roles: []})).toThrow(/id/);
  });
});

describe('assertCanManage', () => {
  it('passes silently when the action is allowed', () => {
    const policy = policyFor(actor('me', 'staff'));
    expect(policy.assertCanManage(target('them', 'intern'))).toBeNull();
  });

  it('refuses with a forbidden status and a reason', () => {
    const policy = policyFor(actor('me', 'intern'));
    expect(policy.assertCanManage(target('them', 'boss'))).toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('kullanıcı'),
    });
  });
});

describe('abilities', () => {
  it('lets an actor edit itself but never delete itself', () => {
    const principal = actor('me', 'staff');
    const abilities = policyFor(principal).getAbilities(target('me', 'staff'));
    expect(abilities).toEqual({update: true, delete: false});
  });

  it('reads the same predicates the guards read', () => {
    const policy = policyFor(actor('me', 'staff'));
    const subject = target('them', 'intern');
    expect(policy.getAbilities(subject)).toEqual({
      update: policy.canManage(subject, {self: true}),
      delete: policy.canManage(subject),
    });
  });

  it('closes both actions on a target out of reach', () => {
    const policy = policyFor(actor('me', 'intern'));
    expect(policy.getAbilities(target('them', 'boss'))).toEqual({
      update: false,
      delete: false,
    });
  });
});
