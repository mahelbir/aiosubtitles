import fp from 'fastify-plugin';
import {config} from '../config/index.js';
import {securityFromHooks} from '../lib/openapi.js';
import {SECURITY_KEY_HEADER} from './security-key.js';

export default fp(
  async function swaggerPlugin(fastify, {basePath = config.apiBasePath} = {}) {
    if (config.env === 'production') {
      return;
    }

    // devDependencies
    const swagger = (await import('@fastify/swagger')).default;
    const {jsonSchemaTransform} = await import('@fastify/type-provider-zod');

    const routePrefix = `${basePath}/swagger`;
    const tagSegmentIndex = basePath.split('/').length;

    /* Derive a route's OpenAPI `security` from the route-level auth hooks it uses
         (hooks tagged with `.openApiSecurity`). Encapsulated autohooks are invisible
         here, so those directories declare security in their own autohook. */
    fastify.addHook('onRoute', route => {
      if (route.url.startsWith(routePrefix)) {
        return;
      }
      const hooks = [route.onRequest, route.preHandler].flat().filter(Boolean);
      const security = securityFromHooks(hooks);
      if (security.length > 0) {
        (route.schema ??= {}).security = security;
      }
      const segment = route.prefix.split('/')[tagSegmentIndex] || 'default';
      (route.schema ??= {}).tags ??= [segment];
    });

    await fastify.register(swagger, {
      openapi: {
        info: {title: 'API', version: 'latest'},
        components: {
          securitySchemes: {
            bearerAuth: {type: 'http', scheme: 'bearer', bearerFormat: 'JWT'},
            securityKey: {
              type: 'apiKey',
              in: 'query',
              name: 'securityKey',
              description: `Also accepted as the \`${SECURITY_KEY_HEADER}\` header when this parameter is absent.`,
            },
          },
        },
      },
      transform: jsonSchemaTransform,
    });

    if (!config.isDev) {
      return;
    }

    const swaggerUi = (await import('@fastify/swagger-ui')).default;
    await fastify.register(swaggerUi, {
      routePrefix,
      logLevel: config.logLevel,
      staticCSP: true,
      uiConfig: {
        persistAuthorization: true,
        operationsSorter: (a, b) => {
          const rank = [
            'get',
            'head',
            'query',
            'post',
            'put',
            'patch',
            'delete',
            'options',
            'trace',
            'connect',
          ];
          return (
            a.get('path').localeCompare(b.get('path')) ||
            rank.indexOf(a.get('method')) - rank.indexOf(b.get('method'))
          );
        },
        tagsSorter: (a, b) =>
          Number(b === 'default') - Number(a === 'default') ||
          a.localeCompare(b),
      },
    });

    fastify.addHook('onListen', async () => {
      const host = config.host === '0.0.0.0' ? 'localhost' : config.host;
      fastify.log.info(
        `Swagger UI on http://${host}:${config.port}${routePrefix}`,
      );
    });
  },
  {name: 'swagger'},
);
