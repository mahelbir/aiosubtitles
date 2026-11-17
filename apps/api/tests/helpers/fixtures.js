import {z} from 'zod';
import {Permission} from '@repo/shared/constants/permission.js';
import {uuidSchema} from '@repo/shared/schemas/common.js';
import {
  getMultiFilterField,
  getOffsetPaginationSchema,
} from '@repo/shared/schemas/pagination.js';
import {User} from '../../src/db/models/user.js';
import {UserRole} from '../../src/db/models/user-role.js';
import {dbUtils} from '../../src/db/utils.js';
import guardAdminSubtree from '../../src/routes/(admin)/autohooks.js';
import getSettingsRoute from '../../src/routes/(admin)/settings/get.js';
import updateSettingsRoute from '../../src/routes/(admin)/settings/update.js';
import {requireAnySocketGuard, socketGuard} from '../../src/sockets/guards.js';
import {LocalNamespace} from '../../src/sockets/local-namespace.js';
import {toHandshakeError} from '../../src/sockets/response.js';
import {fixtureSettings, fixtureSettingsDefinition} from './settings.js';

export const SECURITY_KEY_FIXTURE_URL = '/__fixtures__/security-key';
export const SETTINGS_FIXTURE_URL = '/__fixtures__/settings';
export const HTTP_FIXTURE_URL = '/__fixtures__/http';
export const HTTP_FIXTURE_RECORDS_URL = `${HTTP_FIXTURE_URL}/records`;
export const HTTP_FIXTURE_MESSAGE = 'Fixture yanıtı.';
export const PAGINATION_FIXTURE_URL = '/__fixtures__/pagination';
export const SOCKET_FIXTURE_KEY = 'fixture';

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

const httpFixtureRecordSchema = z.object({email: z.string('E-posta geçersiz')});

const paginationFixtureSchema = getOffsetPaginationSchema({
  sort: ['id', 'email', 'disabledAt'],
  disabled: getMultiFilterField(z.stringbool(), 'Durum geçersiz').optional(),
  roleId: getMultiFilterField(
    z.uuid('Geçersiz rol'),
    'Geçersiz rol',
  ).optional(),
});

class SocketFixture extends LocalNamespace {
  static namespace = '/__fixture__';
  static middlewares = [
    requireAnySocketGuard([
      socketGuard.requireSecurityKey,
      socketGuard.requirePermission(Permission.ADMIN),
    ]),
  ];
}

export const SOCKET_FIXTURE_NAMESPACE = SocketFixture.namespace;

export const socketFixture = new SocketFixture();

export const THROTTLED_SOCKET_FIXTURE_KEY = 'throttledFixture';
export const THROTTLED_SOCKET_FIXTURE_WINDOW = {max: 2, timeWindow: 60000};

class ThrottledSocketFixture extends SocketFixture {
  static namespace = '/__throttled_fixture__';
  static rateLimits = [THROTTLED_SOCKET_FIXTURE_WINDOW];
}

export const THROTTLED_SOCKET_FIXTURE_NAMESPACE =
  ThrottledSocketFixture.namespace;

export const throttledSocketFixture = new ThrottledSocketFixture();

export const FAULTY_SOCKET_FIXTURE_KEY = 'faultyFixture';

class FaultySocketFixture extends LocalNamespace {
  static namespace = '/__faulty_fixture__';
  static middlewares = [
    (socket, next) => next(toHandshakeError(new Error('Fixture fault.'))),
  ];
}

export const FAULTY_SOCKET_FIXTURE_NAMESPACE = FaultySocketFixture.namespace;

export const faultySocketFixture = new FaultySocketFixture();

async function prepareAdminFixture(fastify) {
  await guardAdminSubtree(fastify);
  fastify.addHook('onRoute', route => {
    (route.schema ??= {}).hide = true;
  });
}

export async function securityKeyFixture(fastify) {
  const routeOptions = {
    onRequest: [fastify.requireSecurityKey],
    schema: {hide: true},
  };
  fastify.get(SECURITY_KEY_FIXTURE_URL, routeOptions, async (request, reply) =>
    reply.success(),
  );
  fastify.post(SECURITY_KEY_FIXTURE_URL, routeOptions, async (request, reply) =>
    reply.success(),
  );
}

export async function settingsFixture(fastify) {
  fastify.decorate('settings', fixtureSettings);
  fastify.decorate('settingsDefinition', fixtureSettingsDefinition);
  await prepareAdminFixture(fastify);
  await Promise.all(
    [getSettingsRoute, updateSettingsRoute].map(route =>
      fastify.register(route, {prefix: SETTINGS_FIXTURE_URL}),
    ),
  );
}

export async function httpFixture(fastify) {
  await prepareAdminFixture(fastify);
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
      const record = await User.findByPk(request.params.id, {
        attributes: ['id'],
        rejectOnEmpty: User.notFound,
      });
      return reply.success({id: record.id});
    },
  );
  fastify.post(
    HTTP_FIXTURE_RECORDS_URL,
    {schema: {body: httpFixtureRecordSchema}},
    async (request, reply) => {
      const record = await User.create({email: request.body.email});
      return reply.success({id: record.id});
    },
  );
}

export async function paginationFixture(fastify) {
  await prepareAdminFixture(fastify);
  fastify.get(
    PAGINATION_FIXTURE_URL,
    {schema: {querystring: paginationFixtureSchema}},
    async (request, reply) => {
      const result = await User.paginateByOffset(request.query, {
        attributes: ['id', 'email', 'disabledAt'],
        filters: {
          search: search => ({email: dbUtils.iLike(search)}),
          disabled: flags => {
            const state = dbUtils.nullState(flags);
            return state && {disabledAt: state};
          },
          roleId: roleIds =>
            dbUtils.relatedTo(
              {
                through: UserRole,
                foreignKey: 'userId',
                otherKey: 'roleId',
                values: roleIds,
              },
              User,
            ),
        },
      });
      return reply.success(result);
    },
  );
}
