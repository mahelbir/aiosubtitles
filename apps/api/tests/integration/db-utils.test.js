import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {DataTypes} from 'sequelize';
import {sequelize} from '../../src/db/index.js';
import {dbUtils} from '../../src/db/utils.js';
import {User} from '../../src/db/models/user.js';
import {createUser} from '../helpers/factories.js';

const Charge = sequelize.define(
  'Charge',
  {
    userId: {type: DataTypes.UUID, allowNull: false},
    amountDue: {type: DataTypes.DECIMAL(12, 2), allowNull: false},
  },
  {tableName: 'charges', timestamps: false},
);

const totalDue = async user => {
  const row = await User.findOne({
    where: {id: user.id},
    attributes: [
      [
        dbUtils.relatedSum(
          {target: Charge, foreignKey: 'userId', attribute: 'amountDue'},
          User,
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
    const user = await createUser();
    await Charge.bulkCreate([
      {userId: user.id, amountDue: '12.50'},
      {userId: user.id, amountDue: '7.25'},
    ]);

    expect(await totalDue(user)).toBe(19.75);
  });

  it('answers the number zero when nothing is related', async () => {
    const user = await createUser();

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
    const user = await createUser();
    await Charge.bulkCreate([
      {userId: user.id, amountDue: '1.00'},
      {userId: user.id, amountDue: '2.00'},
    ]);

    await expect(refuseWhileCharged(user)).rejects.toThrow(
      'Refusing to roll back: 2 row(s) would lose their charge.',
    );
  });

  it('lets the rollback through when only rows it keeps exist', async () => {
    const [user, other] = await Promise.all([createUser(), createUser()]);
    await Charge.create({userId: other.id, amountDue: '1.00'});

    await expect(refuseWhileCharged(user)).resolves.toBeUndefined();
  });

  it('counts the rows its own transaction sees', async () => {
    const user = await createUser();
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
