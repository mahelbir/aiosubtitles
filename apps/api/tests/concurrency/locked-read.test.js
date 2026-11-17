import {beforeEach, describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {sequelize} from '../../src/db/index.js';
import {User} from '../../src/db/models/user.js';
import {getTestApp} from '../helpers/app.js';
import {contendWithLockHolder} from '../helpers/concurrency.js';
import {createRole, createUser, toEmail} from '../helpers/factories.js';
import {createHierarchy} from '../helpers/hierarchy.js';

const LOCKED_FINDERS = ['findOneLocked', 'findAllLocked'];
const NARROW_REACH = {maxPosition: 1000, selfId: null};

async function grantWhileLocked(userId, roleId, transaction) {
  const user = await User.findOneLocked(
    {where: {id: userId}, attributes: ['id']},
    transaction,
  );
  await user.addRoles([roleId], {transaction});
}

function findLocked(model, finder, id) {
  return sequelize.transaction(async transaction => {
    const found = await model[finder](
      {where: {id}, attributes: ['id']},
      transaction,
    );
    return Array.isArray(found) ? (found[0] ?? null) : found;
  });
}

async function readRoleIds(id) {
  const user = await User.withScope('withRoles').findByPk(id, {
    attributes: ['id'],
  });
  return user?.roles.map(role => role.id).sort() ?? null;
}

describe('locked finders', () => {
  it.each(LOCKED_FINDERS)(
    '%s reads the join a lock holder committed while it waited',
    async finder => {
      const user = await createUser({email: toEmail('locked-join')});
      const granted = await createRole({slug: 'granted', position: 700});

      const found = await contendWithLockHolder(
        transaction => grantWhileLocked(user.id, granted.id, transaction),
        () => findLocked(User.withScope('withRoles'), finder, user.id),
      );

      expect(found.roles.map(role => role.id)).toEqual([granted.id]);
    },
  );

  it.each(LOCKED_FINDERS)(
    '%s narrows its scope by what a lock holder committed while it waited',
    async finder => {
      const low = await createRole({slug: 'low', position: 500});
      const high = await createRole({slug: 'high', position: 9000});
      const user = await createUser({
        email: toEmail('locked-scope'),
        roles: [low],
      });

      const found = await contendWithLockHolder(
        transaction => grantWhileLocked(user.id, high.id, transaction),
        () =>
          findLocked(
            User.withScope('withRoles').withScope('visibleTo', NARROW_REACH),
            finder,
            user.id,
          ),
      );

      expect(found).toBeNull();
    },
  );
});

describe('a promotion from above racing a lower admin', () => {
  let world;
  let target;

  beforeEach(async () => {
    world = await createHierarchy();
    target = await createUser({
      email: toEmail('contested'),
      roles: [world.roles.intern],
    });
  });

  const promoteWhileLocked = transaction =>
    grantWhileLocked(target.id, world.roles.boss.id, transaction);

  it('answers a role rewrite as not found and keeps the promotion', async () => {
    const app = await getTestApp();

    const response = await contendWithLockHolder(promoteWhileLocked, () =>
      app.inject({
        method: 'PATCH',
        url: `/users/${target.id}`,
        headers: world.headers.manager,
        payload: {roleIds: [world.roles.staff.id]},
      }),
    );

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);
    expect(await readRoleIds(target.id)).toEqual(
      [world.roles.intern.id, world.roles.boss.id].sort(),
    );
  });

  it('leaves the promoted user in place when deleting it', async () => {
    const app = await getTestApp();

    const response = await contendWithLockHolder(promoteWhileLocked, () =>
      app.inject({
        method: 'DELETE',
        url: `/users/${target.id}`,
        headers: world.headers.manager,
      }),
    );

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(await readRoleIds(target.id)).toEqual(
      [world.roles.intern.id, world.roles.boss.id].sort(),
    );
  });
});
