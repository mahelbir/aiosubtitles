import {
  ROLE_POSITION_MAX,
  ROLE_POSITION_MIN,
  ROLE_POSITION_STEP,
  RoleDirection,
  RolePlacement,
} from '@repo/shared/constants/role.js';

const FLOOR = ROLE_POSITION_MIN - 1;
const CEILING = ROLE_POSITION_MAX + 1;

function positionBetween(lower, upper) {
  const value = Math.floor((lower + upper) / 2);
  return value > lower && value < upper ? value : null;
}

function positionAbove(roster, position) {
  return roster.reduce(
    (nearest, role) =>
      role.position > position && role.position < nearest
        ? role.position
        : nearest,
    CEILING,
  );
}

function positionBelow(roster, position) {
  return roster.reduce(
    (nearest, role) =>
      role.position < position && role.position > nearest
        ? role.position
        : nearest,
    FLOOR,
  );
}

function neighborOf(roster, roleId, direction) {
  const index = roster.findIndex(role => role.id === roleId);
  if (index === -1) {
    return null;
  }
  const offset = direction === RoleDirection.UP ? -1 : 1;
  return roster[index + offset] ?? null;
}

function placementBounds(roster, anchor, placement) {
  if (!anchor) {
    return {
      lower: FLOOR,
      upper: roster.length ? roster.at(-1).position : CEILING,
    };
  }
  if (placement === RolePlacement.SAME) {
    return {exact: anchor.position};
  }
  if (placement === RolePlacement.ABOVE) {
    return {
      lower: anchor.position,
      upper: positionAbove(roster, anchor.position),
    };
  }
  return {
    lower: positionBelow(roster, anchor.position),
    upper: anchor.position,
  };
}

function moveBounds(roster, roleId, direction) {
  const neighbor = neighborOf(roster, roleId, direction);
  if (!neighbor) {
    return null;
  }
  return direction === RoleDirection.UP
    ? {
        lower: neighbor.position,
        upper: positionAbove(roster, neighbor.position),
      }
    : {
        lower: positionBelow(roster, neighbor.position),
        upper: neighbor.position,
      };
}

function currentPlacement(roster, role) {
  const above = neighborOf(roster, role?.id, RoleDirection.UP);
  const below = above ? null : neighborOf(roster, role?.id, RoleDirection.DOWN);
  const anchor = above ?? below;
  if (!anchor) {
    return {anchorRoleId: null, placement: RolePlacement.BELOW};
  }
  if (anchor.position === role.position) {
    return {anchorRoleId: anchor.id, placement: RolePlacement.SAME};
  }
  return {
    anchorRoleId: anchor.id,
    placement: above ? RolePlacement.BELOW : RolePlacement.ABOVE,
  };
}

function withRanks(roster) {
  let rank = 0;
  let previous = null;
  return roster.map(role => {
    if (role.position !== previous) {
      previous = role.position;
      rank += 1;
    }
    return {...role, rank};
  });
}

function rebalancePlan(roster) {
  let tier = 0;
  let previous = null;
  return [...roster].reverse().map(role => {
    if (role.position !== previous) {
      previous = role.position;
      tier += 1;
    }
    return {id: role.id, position: tier * ROLE_POSITION_STEP};
  });
}

export const rolePosition = {
  currentPlacement,
  moveBounds,
  neighborOf,
  placementBounds,
  positionBetween,
  rebalancePlan,
  withRanks,
};
