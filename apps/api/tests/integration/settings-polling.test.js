import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {FileSettingsStore} from '@mahelbir/settings';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {config} from '../../src/config/index.js';
import {LoggedSettings} from '../../src/lib/settings.js';
import {fixtureSettingsDefinition} from '../helpers/settings.js';

const POLL_SECONDS = 0.01;
const BROKEN = {limit: -1};
const POLLING_FILE = path.join(config.privateStoragePath, 'polling.json');

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

async function writeFile(values) {
  await fs.writeFile(POLLING_FILE, JSON.stringify(values));
}
