import {beforeEach, describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {getTestApp} from '../helpers/app.js';
import {
  createFixtureRecord,
  createFixtureTag,
  toEmail,
} from '../helpers/factories.js';
import {FixtureRecord, FixtureRecordTag} from '../helpers/fixture-models.js';
import {HTTP_FIXTURE_RECORDS_URL} from '../helpers/fixtures.js';

const MISSING_ID = '018f3a2b-6c4d-7e8f-9a0b-1c2d3e4f5061';

let world;

beforeEach(async () => {
  const kept = await createFixtureTag({label: 'kept', rank: 1500});
  const plain = await createFixtureTag({label: 'plain', rank: 1400});
  const subject = await createFixtureRecord({
    name: toEmail('subject'),
    tags: [kept],
  });
  world = {kept, plain, subject};
});

const tagIdsOf = async recordId =>
  (
    await FixtureRecordTag.findAll({
      where: {recordId},
      attributes: ['tagId'],
      raw: true,
    })
  )
    .map(row => row.tagId)
    .toSorted();

const patchSubject = async payload => {
  const app = await getTestApp();
  return app.inject({
    method: 'PATCH',
    url: `${HTTP_FIXTURE_RECORDS_URL}/${world.subject.id}`,
    payload,
  });
};

describe('an omitted field is left alone', () => {
  it('keeps a record tags when the update does not mention them', async () => {
    const before = await tagIdsOf(world.subject.id);

    const response = await patchSubject({name: toEmail('renamed-subject')});

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(await tagIdsOf(world.subject.id)).toEqual(before);
  });

  it('keeps a record name when the update mentions only its tags', async () => {
    const response = await patchSubject({tagIds: [world.plain.id]});

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(await tagIdsOf(world.subject.id)).toEqual([world.plain.id]);
    expect((await FixtureRecord.findByPk(world.subject.id)).name).toBe(
      toEmail('subject'),
    );
  });
});

describe('a refused membership', () => {
  it('leaves the record intact after the refusal, not half-applied', async () => {
    const response = await patchSubject({
      name: toEmail('half-applied'),
      tagIds: [MISSING_ID],
    });

    expect(response.statusCode).toBe(StatusCodes.CONFLICT);
    expect(await tagIdsOf(world.subject.id)).toEqual([world.kept.id]);
    expect((await FixtureRecord.findByPk(world.subject.id)).name).toBe(
      toEmail('subject'),
    );
  });
});
