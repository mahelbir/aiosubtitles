import closeWithGrace from 'close-with-grace';
import {startInfrastructure} from '../helpers/infrastructure.js';
import {getE2eApiPort, getE2eClientOrigin} from './ports.js';

/* A browser-driven run trips both the budgets `.env.test` sizes for the API
   suite and the login route's own windows, so a zero window removes the
   limiter before the config parses the environment. */
const E2E_ENV = {
  RATE_LIMIT_WINDOW: '0',
  CLIENT_IP_HEADER: '',
  PORT: String(getE2eApiPort()),
  CORS_ORIGINS: getE2eClientOrigin(),
};

const {teardown} = await startInfrastructure({env: E2E_ENV});

let fastify = null;

closeWithGrace(async ({signal, err}) => {
  const log = fastify?.log ?? console;
  if (err) {
    log.error(err, 'E2E server closing with error');
  } else {
    log.info(`${signal} received, e2e server closing`);
  }
  try {
    await fastify?.close();
  } finally {
    await teardown();
  }
});

const [{seedBaseline}, {buildApp}, {config}, {sessionPlugin}] =
  await Promise.all([
    import('../helpers/reset.js'),
    import('../../src/build.js'),
    import('../../src/config/index.js'),
    import('./session.js'),
  ]);
await seedBaseline();

fastify = buildApp({extraPlugins: [sessionPlugin]});

await fastify.listen({port: config.port, host: config.host});
