import {z} from 'zod';
import {uuidSchema} from '@repo/shared/schemas/common.js';
import {
  getMultiFilterField,
  getOffsetPaginationSchema,
} from '@repo/shared/schemas/pagination.js';
import {sequelize} from '../../src/db/index.js';
import {dbUtils} from '../../src/db/utils.js';
import {FixtureRecord, FixtureRecordTag, FixtureTag} from './fixture-models.js';

export const HTTP_FIXTURE_URL = '/__fixtures__/http';
export const HTTP_FIXTURE_RECORDS_URL = `${HTTP_FIXTURE_URL}/records`;
export const HTTP_FIXTURE_MESSAGE = 'Fixture yanıtı.';
export const PAGINATION_FIXTURE_URL = '/__fixtures__/pagination';
export const PAGINATION_FIXTURE_TAGS_URL = `${PAGINATION_FIXTURE_URL}/tags`;

export const fixtureSource = {read: async () => null};

const httpFixtureBodySchema = z.object({
  code: z
    .string('Kod geçersiz')
    .regex(/^[a-z]+$/, 'Kod yalnızca küçük harf içermelidir')
    .max(4, 'Kod en fazla 4 karakter olabilir'),
  count: z
    .number('Sayı geçersiz')
    .int('Sayı tam sayı olmalıdır')
    .positive('Sayı sıfırdan büyük olmalıdır'),
});

const httpFixtureRecordSchema = z.object({name: z.string('Ad geçersiz')});

const httpFixtureRecordUpdateSchema = z.object({
  name: z.string('Ad geçersiz').optional(),
  tagIds: z.array(z.uuid('Geçersiz etiket')).optional(),
});

const paginationFixtureSchema = getOffsetPaginationSchema({
  sort: ['id', 'name', 'disabledAt'],
  disabled: getMultiFilterField(z.stringbool(), 'Durum geçersiz').optional(),
  tagId: getMultiFilterField(
    z.uuid('Geçersiz etiket'),
    'Geçersiz etiket',
  ).optional(),
});

const paginationFixtureTagsSchema = getOffsetPaginationSchema({
  sort: ['id', 'label', 'rank'],
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

export async function paginationFixture(fastify) {
  await hideFixtureRoutes(fastify);
  await fastify.register(paginationFixtureRoutes, {
    prefix: PAGINATION_FIXTURE_URL,
  });
}

async function paginationFixtureRoutes(fastify) {
  fastify.get(
    '/',
    {schema: {querystring: paginationFixtureSchema}},
    async (request, reply) => {
      const result = await FixtureRecord.paginateByOffset(request.query, {
        attributes: ['id', 'name', 'disabledAt'],
        include: [FixtureRecord.tagsInclude],
        filters: {
          search: search => ({name: dbUtils.iLike(search)}),
          disabled: flags => {
            const state = dbUtils.nullState(flags);
            return state && {disabledAt: state};
          },
          tagId: tagIds =>
            dbUtils.relatedTo(
              {
                through: FixtureRecordTag,
                foreignKey: 'recordId',
                otherKey: 'tagId',
                values: tagIds,
              },
              FixtureRecord,
            ),
        },
      });
      return reply.success(result);
    },
  );
  fastify.get(
    '/tags',
    {schema: {querystring: paginationFixtureTagsSchema}},
    async (request, reply) =>
      reply.success(
        await FixtureTag.paginateByOffset(request.query, {
          attributes: ['id', 'label', 'rank'],
          filters: {search: search => ({label: dbUtils.iLike(search)})},
        }),
      ),
  );
}
