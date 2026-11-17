import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {text} from 'node:stream/consumers';
import {fileURLToPath} from 'node:url';

export const LOOPBACK = '127.0.0.1';
export const DB_CLI_FIXTURE_URL = new URL(
  './db-cli-fixture.js',
  import.meta.url,
);
export const DB_CLI_FIXTURE_FAILING_TASK = 'failing-task';
export const DB_CLI_FIXTURE_FAILING_CACHE = 'failing-cache';
export const DB_CLI_FIXTURE_WITHOUT_CLEANUP = 'without-cleanup';
export const DB_CLI_FIXTURE_TASK_LOG = 'Fixture task ran';
export const DB_CLI_FIXTURE_CLEANUP_LOG = 'Fixture cache dropped';

export async function runCliScript(scriptUrl, {args = [], env = {}} = {}) {
  const child = spawn(process.execPath, [fileURLToPath(scriptUrl), ...args], {
    env: {...process.env, ...env},
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const [output, [exitCode]] = await Promise.all([
    text(child.stdout),
    once(child, 'close'),
  ]);
  const logs = output
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
  return {exitCode, logs, messages: logs.map(entry => entry.msg)};
}

export async function getClosedPort() {
  const server = createServer().listen(0, LOOPBACK);
  await once(server, 'listening');
  const {port} = server.address();
  server.close();
  await once(server, 'close');
  return String(port);
}
