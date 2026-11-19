import {isEqual, mapKeys, mapValues, uniqWith} from 'es-toolkit';
import {z} from 'zod';
import {
  SHARED_CREDENTIAL_KINDS_BY_SOURCE,
  toSharedCredentialsKey,
} from '../lib/shared-credential-kinds.js';
import {defineSettings} from '../lib/settings.js';
import {getCredentialSecretField} from './user-config.js';

function getSharedSecretListField(credentialKind) {
  return z
    .array(getCredentialSecretField(credentialKind))
    .overwrite(sharedSecrets => uniqWith(sharedSecrets, isEqual))
    .default([]);
}

export function getSharedCredentialsField(credentialKindsBySource) {
  return z
    .strictObject(
      mapValues(
        mapKeys(credentialKindsBySource, (credentialKinds, subtitleSource) =>
          toSharedCredentialsKey(subtitleSource),
        ),
        credentialKinds =>
          z
            .strictObject(
              Object.fromEntries(
                credentialKinds.map(credentialKind => [
                  toSharedCredentialsKey(credentialKind),
                  getSharedSecretListField(credentialKind),
                ]),
              ),
            )
            .prefault({}),
      ),
    )
    .prefault({});
}

export const settingsDefinition = defineSettings({
  editableFields: {},
  serverFields: {
    sharedCredentials: getSharedCredentialsField(
      SHARED_CREDENTIAL_KINDS_BY_SOURCE,
    ),
  },
  rules: [],
});
