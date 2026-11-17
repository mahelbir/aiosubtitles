import {describe, expect, it} from 'vitest';
import {EmptyResultError} from 'sequelize';
import {sequelize} from '../../src/db/index.js';
import {mapDbError} from '../../src/db/errors.js';
import {BaseModel} from '../../src/db/base-model.js';
import {
  createFixtureRecord,
  createFixtureTag,
  toEmail,
} from '../helpers/factories.js';
import {
  FixtureRecord,
  FixtureRecordTag,
  FixtureTag,
} from '../helpers/fixture-models.js';

const MISSING_ID = '018f3a2b-6c4d-7e8f-9a0b-1c2d3e4f5061';

describe('failure vocabulary', () => {
  it('gives each model its own wording, inherited where none is declared', () => {
    expect(FixtureRecord.notFoundMessage).toBe('Fixture kaydı bulunamadı.');
    expect(FixtureTag.notFoundMessage).toBe(BaseModel.notFoundMessage);
    expect(BaseModel.notFoundMessage).toBe('Kayıt bulunamadı.');
  });

  it('builds a fresh error per read, since a stack belongs to one throw', () => {
    const first = FixtureRecord.notFound;
    const second = FixtureRecord.notFound;
    expect(first).toBeInstanceOf(EmptyResultError);
    expect(first).not.toBe(second);
    expect(first.message).toBe(FixtureRecord.notFoundMessage);
  });
});

describe('foreign key refusals', () => {
  it('refuses a delete of a row still referenced with the shared message', async () => {
    const tag = await createFixtureTag({rank: 500});
    await createFixtureRecord({tags: [tag]});
    const err = await tag.destroy().catch(error => error);
    expect(mapDbError(err).message).toBe(BaseModel.foreignKeyMessage);
  });

  it('refuses a row that points at nothing with the same message', async () => {
    const record = await createFixtureRecord();
    const err = await FixtureRecordTag.create({
      recordId: record.id,
      tagId: MISSING_ID,
    }).catch(error => error);
    expect(mapDbError(err).message).toBe(BaseModel.foreignKeyMessage);
  });
});

describe('findOneAndUpdate', () => {
  it('applies the change and hands back the row', async () => {
    const record = await createFixtureRecord({name: toEmail('to-rename')});
    const updated = await FixtureRecord.findOneAndUpdate(
      {where: {id: record.id}},
      {name: toEmail('renamed')},
    );
    expect(updated.name).toBe(toEmail('renamed'));
    expect((await FixtureRecord.findByPk(record.id)).name).toBe(
      toEmail('renamed'),
    );
  });

  it('answers null for a row that is not there, without writing', async () => {
    expect(
      await FixtureRecord.findOneAndUpdate(
        {where: {id: MISSING_ID}},
        {name: toEmail('nobody')},
      ),
    ).toBeNull();
  });

  it('works inside its own transaction when asked to', async () => {
    const record = await createFixtureRecord({name: toEmail('transactional')});
    const updated = await FixtureRecord.findOneAndUpdate(
      {where: {id: record.id}},
      {name: toEmail('committed')},
      true,
    );
    expect(updated.name).toBe(toEmail('committed'));
    expect((await FixtureRecord.findByPk(record.id)).name).toBe(
      toEmail('committed'),
    );
  });

  it('skips a row another transaction already holds rather than waiting on it', async () => {
    const record = await createFixtureRecord({name: toEmail('contended-row')});

    /* The inner call takes its own connection, so the outer lock is genuinely
       held by someone else — `skipLocked` must answer rather than wait. */
    const result = await sequelize.transaction(async transaction => {
      await FixtureRecord.findOneLocked({where: {id: record.id}}, transaction);
      return FixtureRecord.findOneAndUpdate(
        {where: {id: record.id}},
        {name: toEmail('stolen')},
        true,
      );
    });

    expect(result).toBeNull();
    expect((await FixtureRecord.findByPk(record.id)).name).toBe(
      toEmail('contended-row'),
    );
  });
});

describe('findOffsetPage', () => {
  it('counts what the eliminating include leaves, not the joined rows', async () => {
    const tag = await createFixtureTag({label: 'counted', rank: 900});
    const holder = await createFixtureRecord({
      name: toEmail('holder'),
      tags: [tag],
    });
    await createFixtureRecord({name: toEmail('outsider')});

    const page = await FixtureRecord.withScope('withTags').findOffsetPage(
      0,
      100,
      {
        attributes: ['id'],
        include: [{association: 'tags', required: true, where: {id: tag.id}}],
      },
    );

    expect(page.count).toBe(1);
    expect(page.rows.map(row => row.id)).toEqual([holder.id]);
  });

  it('reads rows and total from one snapshot when consistency is asked for', async () => {
    await createFixtureRecord({name: toEmail('first')});
    const page = await FixtureRecord.findOffsetPage(0, 100, {
      attributes: ['id'],
      consistent: true,
    });
    expect(page.count).toBe(page.rows.length);
  });

  it('joins a caller transaction instead of opening its own', async () => {
    await sequelize.transaction(async transaction => {
      await FixtureRecord.create(
        {name: toEmail('invisible-outside'), secret: 'x'},
        {transaction},
      );
      const page = await FixtureRecord.findOffsetPage(0, 100, {
        attributes: ['id', 'name'],
        transaction,
      });
      expect(page.rows.map(row => row.name)).toContain(
        toEmail('invisible-outside'),
      );
    });
  });
});

describe('locking helpers', () => {
  it('holds a row until the transaction ends', async () => {
    const record = await createFixtureRecord({name: toEmail('locked-row')});

    await sequelize.transaction(async transaction => {
      const locked = await FixtureRecord.findOneLocked(
        {where: {id: record.id}},
        transaction,
      );
      expect(locked.id).toBe(record.id);
    });

    const after = await FixtureRecord.findByPk(record.id);
    expect(after.id).toBe(record.id);
  });

  it('locks a whole set in a stable order', async () => {
    await createFixtureTag({label: 'lock-a', rank: 610});
    await createFixtureTag({label: 'lock-b', rank: 620});

    const locked = await sequelize.transaction(transaction =>
      FixtureTag.findAllLocked(
        {attributes: ['id', 'rank'], order: [['rank', 'ASC']]},
        transaction,
      ),
    );

    const ranks = locked.map(tag => tag.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe('withScope', () => {
  const NONE = -2;

  it('keeps every scope in the chain, arguments included', async () => {
    const low = await createFixtureTag({label: 'chain-low', rank: 500});
    const high = await createFixtureTag({label: 'chain-high', rank: 9000});
    await createFixtureRecord({name: toEmail('chain-seen'), tags: [low]});
    await createFixtureRecord({name: toEmail('chain-hidden'), tags: [high]});

    const rows = await FixtureRecord.withScope('withTags')
      .withScope('rankedAtMost', 1000)
      .findAll({attributes: ['id', 'name']});

    const chained = rows.filter(row => row.name.startsWith('chain-'));
    expect(chained.map(row => row.name)).toEqual([toEmail('chain-seen')]);
    expect(chained[0].tags.map(tag => tag.id)).toEqual([low.id]);
  });

  it('applies a lone scope that takes no argument', async () => {
    await createFixtureRecord({
      name: toEmail('lone-scope'),
      tags: [await createFixtureTag({rank: 400})],
    });
    const row = await FixtureRecord.withScope('withTags').findOne({
      where: {name: toEmail('lone-scope')},
      attributes: ['id'],
    });
    expect(row.tags).toHaveLength(1);
  });

  it('starts each chain from the model it is called on', async () => {
    await createFixtureRecord({
      name: toEmail('ranked'),
      tags: [await createFixtureTag({rank: 400})],
    });
    const total = (await FixtureRecord.unscoped().findAll({attributes: ['id']}))
      .length;
    const narrowed = FixtureRecord.withScope('rankedAtMost', NONE);

    expect((await narrowed.findAll({attributes: ['id']})).length).toBeLessThan(
      total,
    );
    expect(
      (await FixtureRecord.withScope('withTags').findAll({attributes: ['id']}))
        .length,
    ).toBe(total);
  });
});
