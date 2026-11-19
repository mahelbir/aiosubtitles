import {z} from 'zod';
import {uuidSchema} from '@repo/shared/schemas/common.js';
import {sequelize} from '../../src/db/index.js';
import {dbUtils} from '../../src/db/utils.js';
import {FixtureRecord} from './fixture-models.js';

export const HTTP_FIXTURE_URL = '/__fixtures__/http';
export const HTTP_FIXTURE_RECORDS_URL = `${HTTP_FIXTURE_URL}/records`;
export const HTTP_FIXTURE_MESSAGE = 'Fixture response.';

export const fixtureSource = {read: async () => null};

const httpFixtureBodySchema = z.object({
  code: z
    .string('Invalid code')
    .regex(/^[a-z]+$/, 'Code may contain only lowercase letters')
    .max(4, 'Code must be at most 4 characters'),
  count: z
    .number('Invalid count')
    .int('Count must be an integer')
    .positive('Count must be above zero'),
});

const httpFixtureRecordSchema = z.object({name: z.string('Invalid name')});

const httpFixtureRecordUpdateSchema = z.object({
  name: z.string('Invalid name').optional(),
  tagIds: z.array(z.uuid('Invalid tag')).optional(),
});

async function hideFixtureRoutes(fastify) {
  fastify.addHook('onRoute', route => {
    (route.schema ??= {}).hide = true;
  });
}

export async function httpFixture(fastify) {
  await hideFixtureRoutes(fastify);
  fastify.get(HTTP_FIXTURE_URL, async (request, reply) =>
    reply.success(await fixtureSource.read(), HTTP_FIXTURE_MESSAGE),
  );
  fastify.post(
    HTTP_FIXTURE_URL,
    {schema: {body: httpFixtureBodySchema}},
    async (request, reply) => reply.success(),
  );
  fastify.get(
    `${HTTP_FIXTURE_RECORDS_URL}/:id`,
    {schema: {params: uuidSchema}},
    async (request, reply) => {
      const record = await FixtureRecord.withScope('withTags').findByPk(
        request.params.id,
        {rejectOnEmpty: FixtureRecord.notFound},
      );
      return reply.success(dbUtils.getPlain(record));
    },
  );
  fastify.post(
    HTTP_FIXTURE_RECORDS_URL,
    {schema: {body: httpFixtureRecordSchema}},
    async (request, reply) => {
      const record = await FixtureRecord.create({name: request.body.name});
      return reply.success({id: record.id});
    },
  );
  fastify.patch(
    `${HTTP_FIXTURE_RECORDS_URL}/:id`,
    {schema: {params: uuidSchema, body: httpFixtureRecordUpdateSchema}},
    async (request, reply) => {
      const {tagIds, ...values} = request.body;
      await sequelize.transaction(async transaction => {
        const record = await FixtureRecord.findOneLocked(
          {
            where: {id: request.params.id},
            attributes: ['id', 'name'],
            rejectOnEmpty: FixtureRecord.notFound,
          },
          transaction,
        );
        await record.update(values, {transaction});
        if (tagIds) {
          await record.setTags(tagIds, {transaction});
        }
      });
      return reply.success();
    },
  );
}
