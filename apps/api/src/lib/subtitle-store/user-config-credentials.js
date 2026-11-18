import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {openCredentialSecret} from '../credential-secret.js';

function openSecret({userConfigId, subtitleSource, sealedSecret}) {
  try {
    return openCredentialSecret({userConfigId, subtitleSource, sealedSecret});
  } catch {
    return null;
  }
}

export function readUsableCredentials({
  cachedUserConfig,
  subtitleSource,
  credentialKinds,
}) {
  return cachedUserConfig.credentials
    .filter(
      credential =>
        credential.subtitleSource === subtitleSource &&
        credentialKinds.includes(credential.credentialKind) &&
        credential.credentialStatus !== CredentialStatus.INVALID,
    )
    .toSorted(
      (leftCredential, rightCredential) =>
        leftCredential.credentialPosition - rightCredential.credentialPosition,
    )
    .flatMap(({credentialId, credentialKind, sealedSecret}) => {
      const credentialSecret = openSecret({
        userConfigId: cachedUserConfig.userConfigId,
        subtitleSource,
        sealedSecret,
      });
      return credentialSecret
        ? [{...credentialSecret, credentialId, credentialKind}]
        : [];
    });
}
