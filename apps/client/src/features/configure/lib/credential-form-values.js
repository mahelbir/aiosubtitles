import {CredentialKind} from '@repo/shared/constants/credential.js';

export function toBlankCredentialSecret(credentialKind) {
  return Object.fromEntries(
    CredentialKind.item(credentialKind).credentialSecretParts.map(
      credentialSecretPart => [credentialSecretPart, ''],
    ),
  );
}

export function toCredentialFormValues({
  credentialId,
  subtitleSource,
  credentialKind,
}) {
  return {
    ...(credentialId && {credentialId}),
    subtitleSource,
    credentialKind,
    credentialSecret: toBlankCredentialSecret(credentialKind),
  };
}
