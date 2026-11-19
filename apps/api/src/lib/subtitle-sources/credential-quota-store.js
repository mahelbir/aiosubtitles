import {redis} from '../../redis/index.js';
import {deriveSecretKey, fingerprintSecret} from '../crypto.js';
import {createLogger} from '../logger.js';

export const CREDENTIAL_QUOTA_TTL = 60;

const QUOTA_KEY_PREFIX = 'subtitle-source-quota:v1:';

const quotaFingerprintKey = deriveSecretKey('subtitle-source-quota');

const quotaLogger = createLogger('subtitle-source-quota');

export const redisCredentialQuotaStore = Object.freeze({
  async get(storeKey) {
    const storedText = await redis.get(storeKey);
    return storedText === null ? null : JSON.parse(storedText);
  },
  async set(storeKey, quota) {
    await redis.set(
      storeKey,
      JSON.stringify(quota),
      'EX',
      CREDENTIAL_QUOTA_TTL,
    );
  },
  async delete(storeKey) {
    await redis.del(storeKey);
  },
});

function toQuotaStoreKey(
  subtitleSource,
  {credentialId, credentialKind, ...credentialSecret},
) {
  const secretFingerprint = fingerprintSecret(
    JSON.stringify([credentialKind, credentialSecret]),
    quotaFingerprintKey,
  );
  return `${QUOTA_KEY_PREFIX}${subtitleSource}:${credentialId}:${secretFingerprint}`;
}

export function createCredentialQuotaReader({
  subtitleSource,
  fetchQuota,
  quotaStore = redisCredentialQuotaStore,
  logger = quotaLogger,
}) {
  async function runStoreCall(storeCall) {
    try {
      return (await storeCall()) ?? null;
    } catch (error) {
      logger.warn(
        {subtitleSource, storeErrorName: error?.name ?? 'Error'},
        'Credential quota store call failed.',
      );
      return null;
    }
  }

  return {
    async readQuota(credential, {signal} = {}) {
      const storeKey = toQuotaStoreKey(subtitleSource, credential);
      const storedQuota = await runStoreCall(() => quotaStore.get(storeKey));
      if (storedQuota) {
        return storedQuota;
      }
      const quota = await fetchQuota(credential, signal);
      await runStoreCall(() => quotaStore.set(storeKey, quota));
      return quota;
    },
    async dropQuota(credential) {
      await runStoreCall(() =>
        quotaStore.delete(toQuotaStoreKey(subtitleSource, credential)),
      );
    },
  };
}
