import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {FileSettingsStore} from '@mahelbir/settings';
import pino from 'pino';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {config} from '../../src/config/index.js';
import {LoggedSettings} from '../../src/lib/settings.js';
import {fixtureSettingsDefinition} from '../helpers/settings.js';

const POLL_SECONDS = 0.01;
const BROKEN = {limit: -1};
const POLLING_FILE = path.join(config.privateStoragePath, 'polling.json');
const STAGING_FILE = `${POLLING_FILE}.tmp`;

let log;
let settings;

beforeEach(async () => {
  await writeFile({});
  log = {error: vi.fn()};
  settings = new LoggedSettings({
    store: new FileSettingsStore(POLLING_FILE),
    schema: fixtureSettingsDefinition.schema,
    log,
  });
  await settings.reload();
  settings.startPolling(POLL_SECONDS);
});

afterEach(() => {
  settings.stopPolling();
});

it('logs a failing reload once however many ticks repeat it', async () => {
  await writeFile(BROKEN);

  await vi.waitFor(() => expect(log.error).toHaveBeenCalledOnce());
  await sleep(POLL_SECONDS * 1000 * 10);

  expect(log.error).toHaveBeenCalledOnce();
});

it('logs the failure again once a reload has recovered in between', async () => {
  await writeFile(BROKEN);
  await vi.waitFor(() => expect(log.error).toHaveBeenCalledOnce());

  await writeFile({label: 'fixed'});
  await vi.waitFor(async () =>
    expect((await settings.getRaw()).label).toBe('fixed'),
  );
  await writeFile(BROKEN);

  await vi.waitFor(() => expect(log.error).toHaveBeenCalledTimes(2));
});

it('logs a broken file by its path and cause, never a fragment of its content', async () => {
  const secret = 'qzxjvkwpfgmhtrsd';
  await writeContent(`{"apiKeys": ['${secret}']}`);

  await vi.waitFor(() => expect(log.error).toHaveBeenCalledOnce());

  const logged = JSON.stringify(log.error.mock.calls, (_, value) =>
    value instanceof Error ? pino.stdSerializers.err(value) : value,
  );
  expect(logged).toContain(POLLING_FILE);
  expect(logged).toContain('SyntaxError');
  for (let start = 0; start + 4 <= secret.length; start += 1) {
    expect(logged).not.toContain(secret.slice(start, start + 4));
  }
});

async function writeFile(values) {
  await writeContent(JSON.stringify(values));
}

async function writeContent(content) {
  await fs.writeFile(STAGING_FILE, content);
  await fs.rename(STAGING_FILE, POLLING_FILE);
}
