import {describe, expect, it} from 'vitest';
import {sequelize} from '../../src/db/index.js';
import {contendWithLockHolder} from '../helpers/concurrency.js';
import {
  createFixtureRecord,
  createFixtureTag,
  toEmail,
} from '../helpers/factories.js';
import {FixtureRecord} from '../helpers/fixture-models.js';

const LOCKED_FINDERS = ['findOneLocked', 'findAllLocked'];
const NARROW_RANK = 1000;

async function tagWhileLocked(recordId, tagId, transaction) {
  const record = await FixtureRecord.findOneLocked(
    {where: {id: recordId}, attributes: ['id']},
    transaction,
  );
  await record.addTags([tagId], {transaction});
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

describe('locked finders', () => {
  it.each(LOCKED_FINDERS)(
    '%s reads the join a lock holder committed while it waited',
    async finder => {
      const record = await createFixtureRecord({name: toEmail('locked-join')});
      const granted = await createFixtureTag({label: 'granted', rank: 700});

      const found = await contendWithLockHolder(
        transaction => tagWhileLocked(record.id, granted.id, transaction),
        () =>
          findLocked(FixtureRecord.withScope('withTags'), finder, record.id),
      );

      expect(found.tags.map(tag => tag.id)).toEqual([granted.id]);
    },
  );

  it.each(LOCKED_FINDERS)(
    '%s narrows its scope by what a lock holder committed while it waited',
    async finder => {
      const low = await createFixtureTag({label: 'low', rank: 500});
      const high = await createFixtureTag({label: 'high', rank: 9000});
      const record = await createFixtureRecord({
        name: toEmail('locked-scope'),
        tags: [low],
      });

      const found = await contendWithLockHolder(
        transaction => tagWhileLocked(record.id, high.id, transaction),
        () =>
          findLocked(
            FixtureRecord.withScope('withTags').withScope(
              'rankedAtMost',
              NARROW_RANK,
            ),
            finder,
            record.id,
          ),
      );

      expect(found).toBeNull();
    },
  );
});
