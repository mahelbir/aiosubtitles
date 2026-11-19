import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import closeWithGrace from 'close-with-grace';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {startInfrastructure} from '../helpers/infrastructure.js';
import {toSharedApiKeys} from '../helpers/shared-credential-secrets.js';
import {OPENSUBTITLES_SHARED_API_KEY} from './fixture-credentials.js';
import {getE2eApiPort, getE2eClientOrigin} from './ports.js';

/* A browser-driven run trips the budgets `.env.test` sizes for the API
   suite, so a zero window removes the limiter before the config parses the
   environment. */
const E2E_ENV = {
  RATE_LIMIT_WINDOW: '0',
  CLIENT_IP_HEADER: '',
  PORT: String(getE2eApiPort()),
  CORS_ORIGINS: getE2eClientOrigin(),
};

const {teardown} = await startInfrastructure({env: E2E_ENV});

await fs.writeFile(
  path.join(process.env.STORAGE_PATH, 'private', 'settings.json'),
  JSON.stringify({
    sharedCredentials: {
      [SubtitleSource.OPENSUBTITLES]: toSharedApiKeys(
        OPENSUBTITLES_SHARED_API_KEY,
      ),
    },
  }),
);

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

const [{buildApp}, {config}, {createFixtureSubtitleSourceRegistry}] =
  await Promise.all([
    import('../../src/build.js'),
    import('../../src/config/index.js'),
    import('./fixture-subtitle-sources.js'),
  ]);

fastify = buildApp({
  subtitleSourceRegistry: createFixtureSubtitleSourceRegistry(),
  videoCatalog: {
    readCatalogMeta: async () => null,
    resolveKitsuVideo: async () => null,
  },
});

await fastify.listen({port: config.port, host: config.host});
