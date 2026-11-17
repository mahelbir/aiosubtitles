import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {DataTypes} from 'sequelize';
import {sequelize} from '../../src/db/index.js';
import {dbUtils} from '../../src/db/utils.js';
import {createFixtureRecord} from '../helpers/factories.js';
import {FixtureRecord} from '../helpers/fixture-models.js';

const Charge = sequelize.define(
  'Charge',
  {
    userId: {type: DataTypes.UUID, allowNull: false},
    amountDue: {type: DataTypes.DECIMAL(12, 2), allowNull: false},
  },
  {tableName: 'charges', timestamps: false},
);

const totalDue = async user => {
  const row = await FixtureRecord.findOne({
    where: {id: user.id},
    attributes: [
      [
        dbUtils.relatedSum(
          {target: Charge, foreignKey: 'userId', attribute: 'amountDue'},
          FixtureRecord,
        ),
        'total',
      ],
    ],
    raw: true,
  });
  return row.total;
};

beforeAll(async () => {
  await Charge.sync();
});

afterAll(async () => {
  await Charge.drop();
});

describe('relatedSum', () => {
  it('answers the sum of the related rows as a number', async () => {
    const user = await createFixtureRecord();
    await Charge.bulkCreate([
      {userId: user.id, amountDue: '12.50'},
      {userId: user.id, amountDue: '7.25'},
    ]);

    expect(await totalDue(user)).toBe(19.75);
  });

  it('answers the number zero when nothing is related', async () => {
    const user = await createFixtureRecord();

    expect(await totalDue(user)).toBe(0);
  });
});

describe('refuseRollbackIf', () => {
  const refuseWhileCharged = (user, transaction) =>
    dbUtils.refuseRollbackIf(
      {
        query: 'SELECT 1 FROM charges WHERE user_id = :userId',
        replacements: {userId: user.id},
        reason: 'would lose their charge',
        transaction,
      },
      sequelize.getQueryInterface(),
    );

  it('throws while a row the rollback would lose remains', async () => {
    const user = await createFixtureRecord();
    await Charge.bulkCreate([
      {userId: user.id, amountDue: '1.00'},
      {userId: user.id, amountDue: '2.00'},
    ]);

    await expect(refuseWhileCharged(user)).rejects.toThrow(
      'Refusing to roll back: 2 row(s) would lose their charge.',
    );
  });

  it('lets the rollback through when only rows it keeps exist', async () => {
    const [user, other] = await Promise.all([
      createFixtureRecord(),
      createFixtureRecord(),
    ]);
    await Charge.create({userId: other.id, amountDue: '1.00'});

    await expect(refuseWhileCharged(user)).resolves.toBeUndefined();
  });

  it('counts the rows its own transaction sees', async () => {
    const user = await createFixtureRecord();
    const transaction = await sequelize.transaction();
    try {
      await Charge.create({userId: user.id, amountDue: '1.00'}, {transaction});

      await expect(refuseWhileCharged(user, transaction)).rejects.toThrow(
        'Refusing to roll back: 1 row(s)',
      );
      await expect(refuseWhileCharged(user)).resolves.toBeUndefined();
    } finally {
      await transaction.rollback();
    }
  });
});
