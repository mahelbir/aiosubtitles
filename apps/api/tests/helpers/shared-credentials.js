import {Settings} from '@mahelbir/settings';
import {vi} from 'vitest';
import {settingsDefinition} from '@repo/shared/schemas/setting.js';
import {createSharedCredentialPool} from '../../src/lib/subtitle-sources/shared-credential-pool.js';

export function createMemorySettings(storedSettings = {}) {
  let storedData = storedSettings;
  const settings = new Settings({
    store: {
      read: async () => structuredClone(storedData),
      update: async updater => {
        const draftData = structuredClone(storedData);
        storedData = (await updater(draftData)) ?? draftData;
      },
    },
    schema: settingsDefinition.schema,
    onError: null,
  });
  return {
    settings,
    async writeSettings(nextSettings) {
      storedData = nextSettings;
      await settings.reload();
    },
  };
}

export function createTestSharedCredentialPool(sharedCredentials = {}) {
  const clock = {nowMs: 1_000_000};
  const logger = {warn: vi.fn()};
  const {settings, writeSettings} = createMemorySettings({sharedCredentials});
  const sharedCredentialPool = createSharedCredentialPool({
    settings,
    logger,
    readNowMs: () => clock.nowMs,
  });
  return {
    sharedCredentialPool,
    settings,
    logger,
    clock,
    writeSharedCredentials: nextSharedCredentials =>
      writeSettings({sharedCredentials: nextSharedCredentials}),
  };
}
