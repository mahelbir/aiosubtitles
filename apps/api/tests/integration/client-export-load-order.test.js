import {existsSync} from 'node:fs';
import {cp, rm} from 'node:fs/promises';
import {afterAll, describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {config} from '../../src/config/index.js';
import {redis} from '../../src/redis/index.js';
import {getTestApp, getTestAppBasePath} from '../helpers/app.js';
import {CLIENT_EXPORT_FIXTURE_ROOT} from '../helpers/client-export.js';

const CONFIGURE_PAGE_IP_MAX = 60;
const RATE_LIMIT_NAMESPACE = 'rate:';

const isExportRootCreated = !existsSync(config.clientExportRoot);

if (isExportRootCreated) {
  await cp(CLIENT_EXPORT_FIXTURE_ROOT, config.clientExportRoot, {
    recursive: true,
  });
}

afterAll(async () => {
  if (isExportRootCreated) {
    await rm(config.clientExportRoot, {recursive: true, force: true});
  }
});

describe('the client export loaded with the app', () => {
  it('counts a page request in the configure page window', async () => {
    const app = await getTestApp();

    const response = await app.inject({
      method: 'GET',
      url: `${getTestAppBasePath()}/configure`,
    });
    const pageBuckets = await redis.keys(
      `${RATE_LIMIT_NAMESPACE}ip:${CONFIGURE_PAGE_IP_MAX}/*`,
    );

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(pageBuckets).toHaveLength(1);
  });
});
