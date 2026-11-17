import {describe, expect, it} from 'vitest';
import {EmptyResultError} from 'sequelize';
import {sequelize} from '../../src/db/index.js';
import {mapDbError} from '../../src/db/errors.js';
import {Role} from '../../src/db/models/role.js';
import {User} from '../../src/db/models/user.js';
import {UserRole} from '../../src/db/models/user-role.js';
import {BaseModel} from '../../src/db/base-model.js';
import {createRole, createUser, toEmail} from '../helpers/factories.js';

const MISSING_ID = '018f3a2b-6c4d-7e8f-9a0b-1c2d3e4f5061';

describe('failure vocabulary', () => {
  it('gives each model its own wording, inherited where none is declared', () => {
    expect(User.notFoundMessage).toBe('Kullanıcı bulunamadı.');
    expect(Role.notFoundMessage).toBe('Rol bulunamadı.');
    expect(BaseModel.notFoundMessage).toBe('Kayıt bulunamadı.');
  });

  it('builds a fresh error per read, since a stack belongs to one throw', () => {
    const first = User.notFound;
    const second = User.notFound;
    expect(first).toBeInstanceOf(EmptyResultError);
    expect(first).not.toBe(second);
    expect(first.message).toBe(User.notFoundMessage);
  });
});

describe('foreign key refusals', () => {
  it('refuses a delete of a row still referenced with the shared message', async () => {
    const role = await createRole({position: 500});
    await createUser({roles: [role]});
    const err = await role.destroy().catch(error => error);
    expect(mapDbError(err).message).toBe(BaseModel.foreignKeyMessage);
  });

  it('refuses a row that points at nothing with the same message', async () => {
    const user = await createUser();
    const err = await UserRole.create({
      userId: user.id,
      roleId: MISSING_ID,
    }).catch(error => error);
    expect(mapDbError(err).message).toBe(BaseModel.foreignKeyMessage);
  });
});

describe('findOneAndUpdate', () => {
  it('applies the change and hands back the row', async () => {
    const user = await createUser({email: toEmail('to-rename')});
    const updated = await User.findOneAndUpdate(
      {where: {id: user.id}},
      {email: toEmail('renamed')},
    );
    expect(updated.email).toBe(toEmail('renamed'));
    expect((await User.findByPk(user.id)).email).toBe(toEmail('renamed'));
  });

  it('answers null for a row that is not there, without writing', async () => {
    expect(
      await User.findOneAndUpdate(
        {where: {id: MISSING_ID}},
        {email: toEmail('nobody')},
      ),
    ).toBeNull();
  });

  it('works inside its own transaction when asked to', async () => {
    const user = await createUser({email: toEmail('transactional')});
    const updated = await User.findOneAndUpdate(
      {where: {id: user.id}},
      {email: toEmail('committed')},
      true,
    );
    expect(updated.email).toBe(toEmail('committed'));
    expect((await User.findByPk(user.id)).email).toBe(toEmail('committed'));
  });

  it('skips a row another transaction already holds rather than waiting on it', async () => {
    const user = await createUser({email: toEmail('contended-row')});

    /* The inner call takes its own connection, so the outer lock is genuinely
       held by someone else — `skipLocked` must answer rather than wait. */
    const result = await sequelize.transaction(async transaction => {
      await User.findOneLocked({where: {id: user.id}}, transaction);
      return User.findOneAndUpdate(
        {where: {id: user.id}},
        {email: toEmail('stolen')},
        true,
      );
    });

    expect(result).toBeNull();
    expect((await User.findByPk(user.id)).email).toBe(toEmail('contended-row'));
  });
});

describe('findOffsetPage', () => {
  it('counts what the eliminating include leaves, not the joined rows', async () => {
    const role = await createRole({slug: 'counted', position: 900});
    const holder = await createUser({email: toEmail('holder'), roles: [role]});
    await createUser({email: toEmail('outsider')});

    const page = await User.withScope('withRoles').findOffsetPage(0, 100, {
      attributes: ['id'],
      include: [{association: 'roles', required: true, where: {id: role.id}}],
    });

    expect(page.count).toBe(1);
    expect(page.rows.map(row => row.id)).toEqual([holder.id]);
  });

  it('reads rows and total from one snapshot when consistency is asked for', async () => {
    await createUser({email: toEmail('first')});
    const page = await User.findOffsetPage(0, 100, {
      attributes: ['id'],
      consistent: true,
    });
    expect(page.count).toBe(page.rows.length);
  });

  it('joins a caller transaction instead of opening its own', async () => {
    await sequelize.transaction(async transaction => {
      await User.create(
        {email: toEmail('invisible-outside'), password: 'x'},
        {transaction},
      );
      const page = await User.findOffsetPage(0, 100, {
        attributes: ['id', 'email'],
        transaction,
      });
      expect(page.rows.map(row => row.email)).toContain(
        toEmail('invisible-outside'),
      );
    });
  });
});

describe('locking helpers', () => {
  it('holds a row until the transaction ends', async () => {
    const user = await createUser({email: toEmail('locked-row')});

    await sequelize.transaction(async transaction => {
      const locked = await User.findOneLocked(
        {where: {id: user.id}},
        transaction,
      );
      expect(locked.id).toBe(user.id);
    });

    const after = await User.findByPk(user.id);
    expect(after.id).toBe(user.id);
  });

  it('locks a whole set in a stable order', async () => {
    await createRole({slug: 'lock-a', position: 610});
    await createRole({slug: 'lock-b', position: 620});

    const locked = await sequelize.transaction(transaction =>
      Role.findAllLocked(
        {attributes: ['id', 'position'], order: [['position', 'ASC']]},
        transaction,
      ),
    );

    const positions = locked.map(role => role.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

describe('withScope', () => {
  const NOBODY = {maxPosition: -2, selfId: null};

  it('keeps every scope in the chain, arguments included', async () => {
    const low = await createRole({slug: 'chain-low', position: 500});
    const high = await createRole({slug: 'chain-high', position: 9000});
    await createUser({email: toEmail('chain-seen'), roles: [low]});
    await createUser({email: toEmail('chain-hidden'), roles: [high]});

    const rows = await User.withScope('withRoles')
      .withScope('visibleTo', {maxPosition: 1000, selfId: null})
      .findAll({attributes: ['id', 'email']});

    const chained = rows.filter(row => row.email.startsWith('chain-'));
    expect(chained.map(row => row.email)).toEqual([toEmail('chain-seen')]);
    expect(chained[0].roles.map(role => role.id)).toEqual([low.id]);
  });

  it('applies a lone scope that takes no argument', async () => {
    await createUser({
      email: toEmail('lone-scope'),
      roles: [await createRole({position: 400})],
    });
    const row = await User.withScope('withRoles').findOne({
      where: {email: toEmail('lone-scope')},
      attributes: ['id'],
    });
    expect(row.roles).toHaveLength(1);
  });

  it('starts each chain from the model it is called on', async () => {
    const total = (await User.unscoped().findAll({attributes: ['id']})).length;
    const narrowed = User.withScope('visibleTo', NOBODY);

    expect((await narrowed.findAll({attributes: ['id']})).length).toBeLessThan(
      total,
    );
    expect(
      (await User.withScope('withRoles').findAll({attributes: ['id']})).length,
    ).toBe(total);
  });
});
