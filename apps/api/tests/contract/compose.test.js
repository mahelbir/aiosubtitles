import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {escapeRegExp} from 'es-toolkit';
import {describe, expect, it} from 'vitest';
import {getWorkspacePath} from '@repo/tooling/workspace.js';
import {getEnvSchema} from '../../src/config/schema.js';
import {createClientIpResolver} from '../../src/lib/ip.js';

const envShape = getEnvSchema({appPath: '/app'}).shape;

const bundledDbHost = envShape.DB_HOST.parse(undefined);

const redisMaxmemory = envShape.REDIS_MAXMEMORY.parse(undefined);

const WORKSPACE_FOLDERS = ['apps', 'packages'];

const DATASTORE_SERVICES = ['postgres', 'redis'];

function readServiceBlock(compose, service) {
  return compose
    .split(/^(?= {2}[\w-]+:$)/m)
    .find(block => block.startsWith(`  ${service}:\n`));
}

async function readWorkspacePackageDirs() {
  const dirs = await Promise.all(
    WORKSPACE_FOLDERS.map(async folder => {
      const entries = await fs.readdir(path.join(getWorkspacePath(), folder), {
        withFileTypes: true,
      });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => `${folder}/${entry.name}`);
    }),
  );
  return dirs.flat();
}

const TRUST_PROXY_LINE = /^\s*TRUST_PROXY:\s*(.+)$/m;
const DOCKER_GATEWAY = '172.18.0.1';
const CLIENT = '203.0.113.7';
const FORGED = '10.9.9.9';

async function resolveBehindCompose(peer) {
  const [, value] =
    TRUST_PROXY_LINE.exec(await readCompose('docker-compose.yaml')) ?? [];
  return createClientIpResolver({
    header: '',
    trustProxy: envShape.TRUST_PROXY.parse(value),
  })(peer);
}

const readCompose = file =>
  fs.readFile(path.join(getWorkspacePath(), file), 'utf8');

describe.each(['docker-compose.yaml', 'docker-compose.dev.yaml'])(
  '%s',
  file => {
    it('bundles PostgreSQL under the host the API treats as bundled', async () => {
      const compose = await readCompose(file);
      expect(compose).toMatch(
        new RegExp(`aliases:\\s+- ${escapeRegExp(bundledDbHost)}$`, 'm'),
      );
      expect(compose).toContain(`DB_HOST: \${DB_HOST:-${bundledDbHost}}`);
    });

    it('caps Valkey memory at the schema default and evicts only keys that expire', async () => {
      const redis = readServiceBlock(await readCompose(file), 'redis');
      expect(redis).toMatch(
        new RegExp(
          `'--maxmemory',\\s+'\\$\\{REDIS_MAXMEMORY:-${escapeRegExp(redisMaxmemory)}\\}',\\s+'--maxmemory-policy',\\s+'volatile-lru',`,
        ),
      );
    });

    it('stops with a clear error when a port is missing', async () => {
      expect(await readCompose(file)).not.toMatch(/\$\{\w*PORT\}/);
    });

    it('keeps the :+ expansion Coolify cannot parse out of every value but a profile', async () => {
      const lines = (await readCompose(file)).split('\n');
      expect(
        lines.filter(
          line =>
            line.includes(':+') && !line.trimStart().startsWith('profiles:'),
        ),
      ).toEqual([]);
    });
  },
);

describe('the development compose', () => {
  it('keeps every workspace package node_modules in a container volume', async () => {
    const [compose, packageDirs] = await Promise.all([
      readCompose('docker-compose.dev.yaml'),
      readWorkspacePackageDirs(),
    ]);
    for (const packageDir of packageDirs) {
      expect(compose).toMatch(
        new RegExp(
          `^ {4}- ([\\w-]+):/repo/${escapeRegExp(packageDir)}/node_modules$[\\s\\S]*^ {2}\\1:$`,
          'm',
        ),
      );
    }
  });
});

describe('the production compose', () => {
  it.each(DATASTORE_SERVICES)('publishes no %s port', async service => {
    const block = readServiceBlock(
      await readCompose('docker-compose.yaml'),
      service,
    );
    expect(block).toBeDefined();
    expect(block).not.toMatch(/^ {4}ports:/m);
  });

  it('names the caller behind the host proxy, not the proxy itself', async () => {
    expect(
      await resolveBehindCompose({
        remoteAddress: DOCKER_GATEWAY,
        headers: {'x-forwarded-for': CLIENT},
      }),
    ).toBe(CLIENT);
  });

  it('keeps the address the proxy saw for an internet caller forging a hop', async () => {
    expect(
      await resolveBehindCompose({
        remoteAddress: DOCKER_GATEWAY,
        headers: {'x-forwarded-for': `${FORGED}, ${CLIENT}`},
      }),
    ).toBe(CLIENT);
  });
});
