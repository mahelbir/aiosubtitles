import {UserConfigCredential} from '../db/models/user-config-credential.js';
import {decryptSecret, encryptSecret} from './crypto.js';

const getSecretContext = (userConfigId, subtitleSource) =>
  `user-config-credential:${userConfigId}:${subtitleSource}`;

export function sealCredentialSecret({
  userConfigId,
  subtitleSource,
  credentialSecret,
}) {
  return encryptSecret(JSON.stringify(credentialSecret), {
    context: getSecretContext(userConfigId, subtitleSource),
  });
}

export function openCredentialSecret({
  userConfigId,
  subtitleSource,
  sealedSecret,
}) {
  const plain = decryptSecret(sealedSecret, {
    context: getSecretContext(userConfigId, subtitleSource),
  });
  return plain === null ? null : JSON.parse(plain);
}

export async function markCredentialStatus({
  credentialId,
  credentialStatus,
  quotaRemainingCount = null,
  quotaResetAt = null,
  transaction,
}) {
  const credential = await UserConfigCredential.findByPk(credentialId, {
    attributes: ['id', 'userConfigId'],
    transaction,
  });
  await credential?.update(
    {
      credentialStatus,
      credentialCheckedAt: new Date(),
      quotaRemainingCount,
      quotaResetAt,
    },
    {transaction},
  );
}
