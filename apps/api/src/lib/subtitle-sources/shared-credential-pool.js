import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {createLogger} from '../logger.js';
import {settings as appSettings} from '../settings.js';
import {
  SourceCredentialError,
  SourceRateLimitError,
} from './subtitle-source-errors.js';

const SHARED_CREDENTIAL_LIMIT_WINDOW = 60000;
const SHARED_CREDENTIAL_ID_PREFIX = 'shared-credential';
const SHARED_CREDENTIALS_SETTING = 'sharedCredentials';

const sharedCredentialLogger = createLogger('shared-credentials');

function toSharedCredential(subtitleSource, {sharedIndex, sharedSecret}) {
  const [credentialKind] = SubtitleSource.raw(subtitleSource).credentialKinds;
  const [secretPart] = CredentialKind.raw(credentialKind).credentialSecretParts;
  return {
    credentialId: `${SHARED_CREDENTIAL_ID_PREFIX}:${subtitleSource}:${sharedIndex}`,
    credentialKind,
    [secretPart]: sharedSecret,
  };
}

function createSourceState(settingsVersion, knownState = null) {
  return {
    settingsVersion,
    nextIndex: knownState?.nextIndex ?? 0,
    invalidSecrets: new Set(),
    limitedUntilMs: knownState?.limitedUntilMs ?? new Map(),
  };
}

function isLimited(sourceState, sharedSecret, nowMs) {
  return (sourceState.limitedUntilMs.get(sharedSecret) ?? 0) > nowMs;
}

function isUsable(sourceState, sharedSecret, nowMs) {
  return (
    !sourceState.invalidSecrets.has(sharedSecret) &&
    !isLimited(sourceState, sharedSecret, nowMs)
  );
}

function pickSharedSecret({sharedSecrets, sourceState}, nowMs) {
  for (let offset = 0; offset < sharedSecrets.length; offset += 1) {
    const sharedIndex = (sourceState.nextIndex + offset) % sharedSecrets.length;
    const sharedSecret = sharedSecrets[sharedIndex];
    if (isUsable(sourceState, sharedSecret, nowMs)) {
      sourceState.nextIndex = sharedIndex + 1;
      return {sharedIndex, sharedSecret};
    }
  }
  return null;
}

function readLimitedRetryAfterMs({sharedSecrets, sourceState}, nowMs) {
  const limitedUntilTimes = sharedSecrets
    .filter(
      sharedSecret =>
        !sourceState.invalidSecrets.has(sharedSecret) &&
        isLimited(sourceState, sharedSecret, nowMs),
    )
    .map(sharedSecret => sourceState.limitedUntilMs.get(sharedSecret));
  return limitedUntilTimes.length > 0
    ? Math.min(...limitedUntilTimes) - nowMs
    : null;
}

export function createSharedCredentialPool({
  settings = appSettings,
  logger = sharedCredentialLogger,
  readNowMs = Date.now,
} = {}) {
  const sourceStates = new Map();
  let readFailure = null;

  function reportReadFailure(error) {
    const failure = String(error);
    if (failure === readFailure) {
      return;
    }
    readFailure = failure;
    logger.warn(
      {errorName: error?.name},
      'Shared credentials could not be read, so none are used.',
    );
  }

  async function readSharedSecrets(subtitleSource) {
    let sharedSecrets;
    let settingsVersion;
    try {
      [sharedSecrets, settingsVersion] = await Promise.all([
        settings.get(`${SHARED_CREDENTIALS_SETTING}.${subtitleSource}`, []),
        settings.getVersion(),
      ]);
    } catch (error) {
      reportReadFailure(error);
      return {sharedSecrets: [], sourceState: createSourceState(null)};
    }
    readFailure = null;
    const knownState = sourceStates.get(subtitleSource);
    if (knownState?.settingsVersion === settingsVersion) {
      return {sharedSecrets, sourceState: knownState};
    }
    const sourceState = createSourceState(settingsVersion, knownState);
    sourceStates.set(subtitleSource, sourceState);
    return {sharedSecrets, sourceState};
  }

  function recordSharedFailure({
    subtitleSource,
    sourceState,
    sharedPick,
    error,
  }) {
    if (error instanceof SourceRateLimitError) {
      sourceState.limitedUntilMs.set(
        sharedPick.sharedSecret,
        readNowMs() +
          (error.retryAfterMs > 0
            ? error.retryAfterMs
            : SHARED_CREDENTIAL_LIMIT_WINDOW),
      );
      return true;
    }
    if (error instanceof SourceCredentialError) {
      if (sourceState.invalidSecrets.has(sharedPick.sharedSecret)) {
        return true;
      }
      sourceState.invalidSecrets.add(sharedPick.sharedSecret);
      logger.warn(
        {subtitleSource, sharedCredentialIndex: sharedPick.sharedIndex},
        'A shared credential was rejected and stays unused until the settings change.',
      );
      return true;
    }
    return false;
  }

  return {
    async hasUsableCredential(subtitleSource) {
      const {sharedSecrets, sourceState} =
        await readSharedSecrets(subtitleSource);
      return sharedSecrets.some(
        sharedSecret => !sourceState.invalidSecrets.has(sharedSecret),
      );
    },
    async callWithCredential({
      subtitleSource,
      credential,
      isBreakerOnEveryLimit = false,
      runCall,
    }) {
      if (credential) {
        return runCall(credential);
      }
      const sharedPool = await readSharedSecrets(subtitleSource);
      for (
        let attempt = 0;
        attempt < sharedPool.sharedSecrets.length;
        attempt += 1
      ) {
        const sharedPick = pickSharedSecret(sharedPool, readNowMs());
        if (!sharedPick) {
          break;
        }
        const sharedCredential = toSharedCredential(subtitleSource, sharedPick);
        try {
          return await runCall(sharedCredential);
        } catch (error) {
          const isSharedFailure =
            error?.credentialId === sharedCredential.credentialId &&
            recordSharedFailure({
              subtitleSource,
              sourceState: sharedPool.sourceState,
              sharedPick,
              error,
            });
          if (!isSharedFailure) {
            throw error;
          }
        }
      }
      const retryAfterMs = readLimitedRetryAfterMs(sharedPool, readNowMs());
      if (retryAfterMs === null || !isBreakerOnEveryLimit) {
        return runCall(null);
      }
      throw new SourceRateLimitError({
        subtitleSource,
        retryAfterMs,
        credentialId: null,
      });
    },
  };
}

export const sharedCredentialPool = createSharedCredentialPool();
