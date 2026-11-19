import {stubFalse} from 'es-toolkit/compat';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {toSharedCredentialsKey} from '@repo/shared/lib/shared-credential-kinds.js';
import {createLogger} from '../logger.js';
import {settings as appSettings} from '../settings.js';
import {
  SourceCredentialError,
  SourceRateLimitError,
} from './subtitle-source-errors.js';

const SHARED_CREDENTIAL_LIMIT_WINDOW = 60000;
const SHARED_CREDENTIAL_REJECTION_REST = 600000;
const SHARED_CREDENTIAL_ID_PREFIX = 'shared-credential';
const SHARED_CREDENTIALS_SETTING = 'sharedCredentials';

const sharedCredentialLogger = createLogger('shared-credentials');

function toSharedSecretKey(credentialKind, credentialSecret) {
  return JSON.stringify(
    CredentialKind.raw(credentialKind).credentialSecretParts.map(
      credentialSecretPart => credentialSecret[credentialSecretPart],
    ),
  );
}

function toSharedCredential(
  {subtitleSource, credentialKind, credentialSecrets},
  {sharedIndex},
) {
  return {
    credentialId: `${SHARED_CREDENTIAL_ID_PREFIX}:${subtitleSource}:${credentialKind}:${sharedIndex}`,
    credentialKind,
    ...credentialSecrets[sharedIndex],
  };
}

function createSourceState(settingsVersion, knownState = null) {
  return {
    settingsVersion,
    nextIndex: knownState?.nextIndex ?? 0,
    rejectedUntilMs: new Map(),
    limitedUntilMs: knownState?.limitedUntilMs ?? new Map(),
  };
}

function isRejected(sourceState, sharedSecret, nowMs) {
  return (sourceState.rejectedUntilMs.get(sharedSecret) ?? 0) > nowMs;
}

function isLimited(sourceState, sharedSecret, nowMs) {
  return (sourceState.limitedUntilMs.get(sharedSecret) ?? 0) > nowMs;
}

function isUsable(sourceState, sharedSecret, nowMs) {
  return (
    !isRejected(sourceState, sharedSecret, nowMs) &&
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

function pickPreferredSecret(
  {sharedSecrets, sourceState},
  nowMs,
  isPreferredSecret,
) {
  const sharedIndex = sharedSecrets.findIndex(
    (sharedSecret, secretIndex) =>
      !isRejected(sourceState, sharedSecret, nowMs) &&
      isPreferredSecret({sharedIndex: secretIndex, sharedSecret}),
  );
  return sharedIndex === -1
    ? null
    : {sharedIndex, sharedSecret: sharedSecrets[sharedIndex]};
}

function readLimitedRetryAfterMs({sharedSecrets, sourceState}, nowMs) {
  const limitedUntilTimes = sharedSecrets
    .filter(
      sharedSecret =>
        !isRejected(sourceState, sharedSecret, nowMs) &&
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

  async function readSharedPool({subtitleSource, credentialKind}) {
    const stateKey = `${subtitleSource}:${credentialKind}`;
    let credentialSecrets;
    let settingsVersion;
    try {
      [credentialSecrets, settingsVersion] = await Promise.all([
        settings.get(
          [
            SHARED_CREDENTIALS_SETTING,
            toSharedCredentialsKey(subtitleSource),
            toSharedCredentialsKey(credentialKind),
          ].join('.'),
          [],
        ),
        settings.getVersion(),
      ]);
    } catch (error) {
      reportReadFailure(error);
      return {
        subtitleSource,
        credentialKind,
        credentialSecrets: [],
        sharedSecrets: [],
        sourceState: createSourceState(null),
      };
    }
    readFailure = null;
    const sharedPool = {
      subtitleSource,
      credentialKind,
      credentialSecrets,
      sharedSecrets: credentialSecrets.map(credentialSecret =>
        toSharedSecretKey(credentialKind, credentialSecret),
      ),
    };
    const knownState = sourceStates.get(stateKey);
    if (knownState?.settingsVersion === settingsVersion) {
      return {...sharedPool, sourceState: knownState};
    }
    const sourceState = createSourceState(settingsVersion, knownState);
    sourceStates.set(stateKey, sourceState);
    return {...sharedPool, sourceState};
  }

  function recordSharedFailure({sharedPool, sharedPick, error}) {
    const {subtitleSource, credentialKind, sourceState} = sharedPool;
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
      const nowMs = readNowMs();
      if (isRejected(sourceState, sharedPick.sharedSecret, nowMs)) {
        return true;
      }
      sourceState.rejectedUntilMs.set(
        sharedPick.sharedSecret,
        nowMs + SHARED_CREDENTIAL_REJECTION_REST,
      );
      logger.warn(
        {
          subtitleSource,
          credentialKind,
          sharedCredentialIndex: sharedPick.sharedIndex,
        },
        'A shared credential was rejected and rests before it is tried again.',
      );
      return true;
    }
    return false;
  }

  return {
    async hasConfiguredCredential({subtitleSource, credentialKind}) {
      const {sharedSecrets} = await readSharedPool({
        subtitleSource,
        credentialKind,
      });
      return sharedSecrets.length > 0;
    },
    async hasUsableCredential({subtitleSource, credentialKind}) {
      const {sharedSecrets, sourceState} = await readSharedPool({
        subtitleSource,
        credentialKind,
      });
      const nowMs = readNowMs();
      return sharedSecrets.some(
        sharedSecret => !isRejected(sourceState, sharedSecret, nowMs),
      );
    },
    async callWithCredential({
      subtitleSource,
      credentialKind,
      credential,
      isBreakerOnEveryLimit = false,
      isPreferredCredential = stubFalse,
      runCall,
    }) {
      if (credential) {
        return runCall(credential);
      }
      const sharedPool = await readSharedPool({subtitleSource, credentialKind});
      for (
        let attempt = 0;
        attempt < sharedPool.sharedSecrets.length;
        attempt += 1
      ) {
        const sharedPick =
          (attempt === 0 &&
            pickPreferredSecret(sharedPool, readNowMs(), preferredPick =>
              isPreferredCredential(
                toSharedCredential(sharedPool, preferredPick),
              ),
            )) ||
          pickSharedSecret(sharedPool, readNowMs());
        if (!sharedPick) {
          break;
        }
        const sharedCredential = toSharedCredential(sharedPool, sharedPick);
        try {
          return await runCall(sharedCredential);
        } catch (error) {
          const isSharedFailure =
            error?.credentialId === sharedCredential.credentialId &&
            recordSharedFailure({sharedPool, sharedPick, error});
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
