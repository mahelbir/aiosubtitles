import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';

export default fp(
  async function helmetPlugin(fastify) {
    await fastify.register(helmet, {
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'none'"],
          'base-uri': ["'none'"],
          'form-action': ["'none'"],
          'frame-ancestors': ["'none'"],
        },
      },
      crossOriginResourcePolicy: {policy: 'cross-origin'},
      strictTransportSecurity: {includeSubDomains: false},
      xFrameOptions: {action: 'deny'},
    });
  },
  {name: 'helmet'},
);
