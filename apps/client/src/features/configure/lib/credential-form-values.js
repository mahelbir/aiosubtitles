import {CredentialKind} from '@repo/shared/constants/credential.js';

export function toBlankCredentialSecret(credentialKind) {
  return Object.fromEntries(
    CredentialKind.item(credentialKind).credentialSecretParts.map(
      credentialSecretPart => [credentialSecretPart, ''],
    ),
  );
}

export function isCredentialEntered({credentialId, credentialSecret}) {
  return (
    credentialId !== undefined ||
    Object.values(credentialSecret).every(
      credentialSecretPart => credentialSecretPart.trim() !== '',
    )
  );
}

export function toCredentialFormValues({
  credentialId,
  subtitleSource,
  credentialKind,
  credentialSecret,
}) {
  return {
    ...(credentialId && {credentialId}),
    subtitleSource,
    credentialKind,
    credentialSecret: {
      ...toBlankCredentialSecret(credentialKind),
      ...credentialSecret,
    },
  };
}
