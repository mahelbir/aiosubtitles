import {readFile} from 'node:fs/promises';
import {camelCase, flattenObject, mapKeys, mapValues} from 'es-toolkit';
import {describe, expect, it} from 'vitest';
import {
  SHARED_CREDENTIAL_KINDS_BY_SOURCE,
  toSharedCredentialsKey,
} from '@repo/shared/lib/shared-credential-kinds.js';
import {settingsDefinition} from '@repo/shared/schemas/setting.js';

const SETTINGS_EXAMPLE_URL = new URL(
  '../../storage/private/settings.json.example',
  import.meta.url,
);

async function readSettingsExample() {
  return JSON.parse(await readFile(SETTINGS_EXAMPLE_URL, 'utf8'));
}

describe('the settings example', () => {
  it('passes the settings schema as written', async () => {
    const settingsExample = await readSettingsExample();

    expect(settingsDefinition.schema.parse(settingsExample)).toEqual(
      settingsExample,
    );
  });

  it('fills every source and kind that takes shared credentials', async () => {
    const {sharedCredentials} = await readSettingsExample();

    expect(
      mapValues(sharedCredentials, credentialLists =>
        Object.keys(credentialLists),
      ),
    ).toEqual(
      mapValues(
        mapKeys(SHARED_CREDENTIAL_KINDS_BY_SOURCE, (credentialKinds, source) =>
          toSharedCredentialsKey(source),
        ),
        credentialKinds => credentialKinds.map(toSharedCredentialsKey),
      ),
    );
    expect(
      Object.values(sharedCredentials)
        .flatMap(credentialLists => Object.values(credentialLists))
        .every(sharedSecrets => sharedSecrets.length > 0),
    ).toBe(true);
  });

  it('writes every key in camelCase', async () => {
    const settingsKeys = Object.keys(
      flattenObject(await readSettingsExample()),
    ).flatMap(settingsPath => settingsPath.split(/[.[\]]/).filter(Boolean));

    expect(
      settingsKeys.filter(
        settingsKey =>
          !/^\d+$/.test(settingsKey) && settingsKey !== camelCase(settingsKey),
      ),
    ).toEqual([]);
  });
});
