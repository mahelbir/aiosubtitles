import {describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {
  ROLE_POSITION_STEP,
  RolePlacement,
} from '@repo/shared/constants/role.js';
import {Permission} from '@repo/shared/constants/permission.js';
import {getTestApp} from '../helpers/app.js';
import {readEnvelope} from '../helpers/assertions.js';
import {settleConcurrently} from '../helpers/concurrency.js';
import {
  authHeaders,
  createRole,
  createUser,
  toEmail,
} from '../helpers/factories.js';
import {Role} from '../../src/db/models/role.js';

const ROSTER_ORDER = [
  ['position', 'DESC'],
  ['id', 'ASC'],
];

async function readRoster() {
  return Role.findAll({
    attributes: ['id', 'slug', 'position'],
    order: ROSTER_ORDER,
    raw: true,
  });
}

async function actorAbove(position) {
  const role = await createRole({
    slug: 'concurrency-actor',
    position,
    permissions: [Permission.ADMIN, Permission.USER_MANAGE_PEER],
  });
  const user = await createUser({
    email: toEmail('concurrency-actor'),
    roles: [role],
  });
  return authHeaders(user);
}

describe('concurrent role creation', () => {
  it('gives every winner a position, or refuses — never a duplicate identity', async () => {
    const app = await getTestApp();
    const headers = await actorAbove(900000);
    const anchor = await createRole({slug: 'anchor', position: 10000});

    const results = await settleConcurrently(6, index =>
      app.inject({
        method: 'POST',
        url: '/roles',
        headers,
        payload: {
          slug: `race-${index}`,
          label: `Race ${index}`,
          anchorRoleId: anchor.id,
          placement: RolePlacement.ABOVE,
          permissions: [],
        },
      }),
    );

    const created = results
      .filter(entry => entry.status === 'fulfilled')
      .filter(entry => entry.value.statusCode === StatusCodes.CREATED);
    expect(created.length).toBeGreaterThan(0);

    const roster = await readRoster();
    expect(new Set(roster.map(role => role.id)).size).toBe(roster.length);
    expect(new Set(roster.map(role => role.slug)).size).toBe(roster.length);
  });

  it('leaves the roster ordered and inside its bounds', async () => {
    const app = await getTestApp();
    const headers = await actorAbove(900000);
    const anchor = await createRole({slug: 'anchor', position: 10000});

    await settleConcurrently(6, index =>
      app.inject({
        method: 'POST',
        url: '/roles',
        headers,
        payload: {
          slug: `race-${index}`,
          label: `Race ${index}`,
          anchorRoleId: anchor.id,
          placement: RolePlacement.BELOW,
          permissions: [],
        },
      }),
    );

    const roster = await readRoster();
    const positions = roster.map(role => role.position);
    expect(positions).toEqual([...positions].sort((a, b) => b - a));
    for (const position of positions) {
      expect(position).toBeGreaterThan(0);
    }
  });
});

describe('gap exhaustion', () => {
  it('rebalances rather than refusing when the gap runs out', async () => {
    const app = await getTestApp();
    const headers = await actorAbove(900000);
    const lower = await createRole({slug: 'lower', position: 5000});
    await createRole({slug: 'upper', position: 5001});

    const response = await app.inject({
      method: 'POST',
      url: '/roles',
      headers,
      payload: {
        slug: 'squeezed',
        label: 'Squeezed',
        anchorRoleId: lower.id,
        placement: RolePlacement.ABOVE,
        permissions: [],
      },
    });

    expect(response.statusCode).toBe(StatusCodes.CREATED);

    const roster = await readRoster();
    const positions = roster.map(role => role.position);
    expect(new Set(positions).size).toBe(positions.length);
    expect(positions).toEqual([...positions].sort((a, b) => b - a));

    /* The neighbours were respaced onto whole steps to free the gap; the new
       role then took the midpoint the respacing opened. */
    const byslug = new Map(roster.map(role => [role.slug, role.position]));
    expect(byslug.get('lower') % ROLE_POSITION_STEP).toBe(0);
    expect(byslug.get('upper') % ROLE_POSITION_STEP).toBe(0);
    expect(byslug.get('lower')).not.toBe(5000);
    expect(byslug.get('upper')).not.toBe(5001);
  });

  it('keeps relative order across the rebalance', async () => {
    const app = await getTestApp();
    const headers = await actorAbove(900000);
    const lower = await createRole({slug: 'lower', position: 5000});
    const upper = await createRole({slug: 'upper', position: 5001});

    await app.inject({
      method: 'POST',
      url: '/roles',
      headers,
      payload: {
        slug: 'squeezed',
        label: 'Squeezed',
        anchorRoleId: lower.id,
        placement: RolePlacement.ABOVE,
        permissions: [],
      },
    });

    const roster = await readRoster();
    const order = roster.map(role => role.slug);
    expect(order.indexOf('upper')).toBeLessThan(order.indexOf('squeezed'));
    expect(order.indexOf('squeezed')).toBeLessThan(order.indexOf('lower'));
    expect(upper.id).not.toBe(lower.id);
  });
});

describe('concurrent moves', () => {
  it('never loses a role or duplicates a position pair', async () => {
    const app = await getTestApp();
    const headers = await actorAbove(900000);
    const ladder = [];
    for (const index of [1, 2, 3, 4]) {
      ladder.push(
        await createRole({slug: `rung-${index}`, position: index * 1000}),
      );
    }

    const before = await readRoster();
    await settleConcurrently(4, index =>
      app.inject({
        method: 'PATCH',
        url: `/roles/${ladder[index].id}/move`,
        headers,
        payload: {direction: index % 2 === 0 ? 'up' : 'down'},
      }),
    );

    const after = await readRoster();
    expect(after).toHaveLength(before.length);
    expect(new Set(after.map(role => role.id)).size).toBe(after.length);
    const positions = after.map(role => role.position);
    expect(positions).toEqual([...positions].sort((a, b) => b - a));
  });

  it('refuses to move the bottom role any lower', async () => {
    const app = await getTestApp();
    const headers = await actorAbove(900000);
    const bottom = await createRole({slug: 'floor', position: 100});
    const response = await app.inject({
      method: 'PATCH',
      url: `/roles/${bottom.id}/move`,
      headers,
      payload: {direction: 'down'},
    });
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(readEnvelope(response).message).toContain('en altta');
  });

  /* Moving up always lands the role at or above the actor own level, and the
     reach check answers before the bounds check does — so the "already at the
     top" wording is not reachable through the API. */
  it('answers a move that would reach the actor own level as a refusal', async () => {
    const app = await getTestApp();
    const headers = await actorAbove(900000);
    const below = await createRole({slug: 'ceiling', position: 800000});
    const response = await app.inject({
      method: 'PATCH',
      url: `/roles/${below.id}/move`,
      headers,
      payload: {direction: 'up'},
    });
    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN);
    expect(readEnvelope(response).message).toContain('seviyenizin');
  });
});
