import {camelCase} from 'es-toolkit';
import {SubtitleSource} from '../constants/subtitle-source.js';

export function listSharedCredentialKinds(subtitleSource) {
  if (!SubtitleSource.has(subtitleSource)) {
    return [];
  }
  return SubtitleSource.item(subtitleSource).sharedCredentialKinds ?? [];
}

export function toSharedCredentialsKey(enumValue) {
  return camelCase(enumValue);
}

export const SHARED_CREDENTIAL_KINDS_BY_SOURCE = Object.freeze(
  Object.fromEntries(
    SubtitleSource.values
      .map(subtitleSource => [
        subtitleSource,
        listSharedCredentialKinds(subtitleSource),
      ])
      .filter(([, credentialKinds]) => credentialKinds.length > 0),
  ),
);
