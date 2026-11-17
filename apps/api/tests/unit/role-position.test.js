import {describe, expect, it} from 'vitest';
import {
  ROLE_POSITION_STEP,
  RoleDirection,
  RolePlacement,
} from '@repo/shared/constants/role.js';
import {rolePosition} from '../../src/lib/auth/role-position.js';

/* A roster is ordered position DESC, id ASC — highest authority first. */
const roster = [
  {id: 'top', position: 3000},
  {id: 'mid-a', position: 2000},
  {id: 'mid-b', position: 2000},
  {id: 'low', position: 1000},
];

describe('positionBetween', () => {
  it('takes the midpoint of an open gap', () => {
    expect(rolePosition.positionBetween(1000, 2000)).toBe(1500);
  });

  it('returns null when no integer fits, which is what triggers a rebalance', () => {
    expect(rolePosition.positionBetween(1000, 1001)).toBeNull();
    expect(rolePosition.positionBetween(1000, 1000)).toBeNull();
  });
});

describe('neighborOf', () => {
  it('walks the roster in the requested direction', () => {
    expect(rolePosition.neighborOf(roster, 'mid-a', RoleDirection.UP).id).toBe(
      'top',
    );
    expect(
      rolePosition.neighborOf(roster, 'mid-a', RoleDirection.DOWN).id,
    ).toBe('mid-b');
  });

  it('returns null at either end', () => {
    expect(rolePosition.neighborOf(roster, 'top', RoleDirection.UP)).toBeNull();
    expect(
      rolePosition.neighborOf(roster, 'low', RoleDirection.DOWN),
    ).toBeNull();
  });

  it('returns null for a role the roster does not hold', () => {
    expect(
      rolePosition.neighborOf(roster, 'ghost', RoleDirection.UP),
    ).toBeNull();
  });
});

describe('placementBounds', () => {
  it('places a role above its anchor, below whatever sits over it', () => {
    const anchor = roster.find(role => role.id === 'low');
    expect(
      rolePosition.placementBounds(roster, anchor, RolePlacement.ABOVE),
    ).toEqual({lower: 1000, upper: 2000});
  });

  it('places a role below its anchor, above whatever sits under it', () => {
    const anchor = roster.find(role => role.id === 'top');
    expect(
      rolePosition.placementBounds(roster, anchor, RolePlacement.BELOW),
    ).toEqual({lower: 2000, upper: 3000});
  });

  it('reuses the anchor position exactly for the same level', () => {
    const anchor = roster.find(role => role.id === 'mid-a');
    expect(
      rolePosition.placementBounds(roster, anchor, RolePlacement.SAME),
    ).toEqual({exact: 2000});
  });

  it('lands under the whole roster when there is no anchor', () => {
    expect(
      rolePosition.placementBounds(roster, null, RolePlacement.BELOW),
    ).toMatchObject({upper: 1000});
  });
});

describe('moveBounds', () => {
  it('opens the gap above the neighbour when moving up', () => {
    expect(rolePosition.moveBounds(roster, 'low', RoleDirection.UP)).toEqual({
      lower: 2000,
      upper: 3000,
    });
  });

  it('clears a whole shared level when moving down, not just one of its members', () => {
    expect(rolePosition.moveBounds(roster, 'top', RoleDirection.DOWN)).toEqual({
      lower: 1000,
      upper: 2000,
    });
  });

  it('returns null at the end of the roster, which the route renders as a refusal', () => {
    expect(rolePosition.moveBounds(roster, 'top', RoleDirection.UP)).toBeNull();
    expect(
      rolePosition.moveBounds(roster, 'low', RoleDirection.DOWN),
    ).toBeNull();
  });
});

describe('withRanks', () => {
  it('gives roles sharing a position the same rank', () => {
    expect(rolePosition.withRanks(roster).map(role => role.rank)).toEqual([
      1, 2, 2, 3,
    ]);
  });

  it('leaves the input untouched', () => {
    rolePosition.withRanks(roster);
    expect(roster[0]).not.toHaveProperty('rank');
  });
});

describe('rebalancePlan', () => {
  it('respaces the roster onto whole steps from the bottom up', () => {
    expect(rolePosition.rebalancePlan(roster)).toEqual([
      {id: 'low', position: ROLE_POSITION_STEP},
      {id: 'mid-b', position: ROLE_POSITION_STEP * 2},
      {id: 'mid-a', position: ROLE_POSITION_STEP * 2},
      {id: 'top', position: ROLE_POSITION_STEP * 3},
    ]);
  });

  it('keeps a shared level shared, so a rebalance never reorders authority', () => {
    const plan = rolePosition.rebalancePlan(roster);
    const byId = new Map(plan.map(entry => [entry.id, entry.position]));
    expect(byId.get('mid-a')).toBe(byId.get('mid-b'));
    expect(byId.get('top')).toBeGreaterThan(byId.get('mid-a'));
  });

  it('returns nothing for an empty roster', () => {
    expect(rolePosition.rebalancePlan([])).toEqual([]);
  });
});

describe('currentPlacement', () => {
  it('describes a role by the neighbour above it', () => {
    expect(rolePosition.currentPlacement(roster, roster[3])).toEqual({
      anchorRoleId: 'mid-b',
      placement: RolePlacement.BELOW,
    });
  });

  it('falls back to the neighbour below for the topmost role', () => {
    expect(rolePosition.currentPlacement(roster, roster[0])).toEqual({
      anchorRoleId: 'mid-a',
      placement: RolePlacement.ABOVE,
    });
  });

  it('reports a shared level as such', () => {
    expect(rolePosition.currentPlacement(roster, roster[2])).toEqual({
      anchorRoleId: 'mid-a',
      placement: RolePlacement.SAME,
    });
  });

  it('anchors on nothing when the role stands alone', () => {
    expect(rolePosition.currentPlacement([], {id: 'solo'})).toEqual({
      anchorRoleId: null,
      placement: RolePlacement.BELOW,
    });
  });
});
