import {isNil} from 'es-toolkit';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {createLogger} from '../../logger.js';
import {sharedCredentialPool as defaultSharedCredentialPool} from '../shared-credential-pool.js';
import {SubtitleSourceBudgetScope} from '../subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceRateLimitError,
  SourceUnavailableError,
} from '../subtitle-source-errors.js';
import {
  requestSubtitleSource as requestSite,
  toSubtitleSourceError,
} from '../subtitle-source-request.js';
import {opensubtitlesMapping} from './opensubtitles-mapping.js';
import * as opensubtitlesSession from './opensubtitles-session.js';
import {
  toOpensubtitlesAppKeyFingerprint,
  toOpensubtitlesSessionKey,
} from './opensubtitles-session.js';

const CREDENTIAL_DOWNLOAD_WINDOW = 5000;
const CREDENTIAL_DOWNLOAD_MAX = 1;
const APP_KEY_DOWNLOAD_WINDOW = 60000;
const APP_KEY_DOWNLOAD_MAX = 10;

const opensubtitlesLogger = createLogger('opensubtitles');

function isQuotaComplete(quota) {
  return !isNil(quota?.quotaRemainingCount) && !isNil(quota.quotaAllowedCount);
}

function isAccount(credential) {
  return credential.credentialKind === CredentialKind.ACCOUNT;
}

function isRejectedCredential(error, credential) {
  return (
    error instanceof SourceCredentialError &&
    error.credentialId === credential.credentialId
  );
}

function isSessionPinnedTo(session, appCredential) {
  return (
    typeof session?.appKeyFingerprint === 'string' &&
    session.appKeyFingerprint ===
      toOpensubtitlesAppKeyFingerprint(appCredential.apiKey)
  );
}

function toCredentialIds(credential) {
  return {credentialId: credential.credentialId};
}

function awaitUnlessAborted(sharedPromise, signal) {
  if (!signal) {
    return sharedPromise;
  }
  return new Promise((resolve, reject) => {
    const rejectAborted = () => {
      reject(
        toSubtitleSourceError(signal.reason, {
          subtitleSource: SubtitleSource.OPENSUBTITLES,
        }),
      );
    };
    if (signal.aborted) {
      rejectAborted();
      return;
    }
    signal.addEventListener('abort', rejectAborted, {once: true});
    sharedPromise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', rejectAborted);
    });
  });
}

export function createOpensubtitlesClient({
  requestSubtitleSource,
  sharedCredentialPool = defaultSharedCredentialPool,
  sessionStore = opensubtitlesSession,
  logger = opensubtitlesLogger,
}) {
  const subtitleSource = SubtitleSource.OPENSUBTITLES;
  const loginByPinKey = new Map();

  async function runStoreCall(storeCall) {
    try {
      return await storeCall();
    } catch (error) {
      logger.warn(
        {storeErrorName: error?.name ?? 'Error'},
        'OpenSubtitles session store call failed.',
      );
      return null;
    }
  }

  function storeQuotaReport(credential, quotaReport) {
    runStoreCall(() =>
      sessionStore.storeOpensubtitlesQuota(
        toOpensubtitlesSessionKey(credential),
        quotaReport,
      ),
    );
  }

  function readStoredSession(credential) {
    return runStoreCall(() =>
      sessionStore.readOpensubtitlesSession(
        toOpensubtitlesSessionKey(credential),
      ),
    );
  }

  async function logIn(credential, appCredential) {
    const session = {
      ...opensubtitlesMapping.toSession(
        await requestSubtitleSource(
          opensubtitlesMapping.buildLoginRequest(credential, appCredential),
        ),
        toCredentialIds(credential),
      ),
      appKeyFingerprint: toOpensubtitlesAppKeyFingerprint(appCredential.apiKey),
    };
    await runStoreCall(() =>
      sessionStore.storeOpensubtitlesSession(
        toOpensubtitlesSessionKey(credential),
        session,
      ),
    );
    return session;
  }

  function getSession({credential, appCredential, storedSession, signal}) {
    if (isSessionPinnedTo(storedSession, appCredential)) {
      return awaitUnlessAborted(Promise.resolve(storedSession), signal);
    }
    const pinKey = `${toOpensubtitlesSessionKey(credential)}:${toOpensubtitlesAppKeyFingerprint(appCredential.apiKey)}`;
    let loginPromise = loginByPinKey.get(pinKey);
    if (!loginPromise) {
      loginPromise = logIn(credential, appCredential).finally(() => {
        loginByPinKey.delete(pinKey);
      });
      loginByPinKey.set(pinKey, loginPromise);
    }
    return awaitUnlessAborted(loginPromise, signal);
  }

  async function refreshSession({
    credential,
    appCredential,
    staleSession,
    signal,
  }) {
    const storedSession = await readStoredSession(credential);
    if (
      storedSession &&
      storedSession.token !== staleSession.token &&
      isSessionPinnedTo(storedSession, appCredential)
    ) {
      return storedSession;
    }
    await runStoreCall(() =>
      sessionStore.dropOpensubtitlesSession(
        toOpensubtitlesSessionKey(credential),
      ),
    );
    return getSession({
      credential,
      appCredential,
      storedSession: null,
      signal,
    });
  }

  async function callWithSession({
    credential,
    appCredential,
    storedSession,
    signal,
    sessionCall,
  }) {
    const session = await getSession({
      credential,
      appCredential,
      storedSession,
      signal,
    });
    try {
      return await sessionCall(session);
    } catch (error) {
      if (!isRejectedCredential(error, credential)) {
        throw error;
      }
    }
    const freshSession = await refreshSession({
      credential,
      appCredential,
      staleSession: session,
      signal,
    });
    try {
      return await sessionCall(freshSession);
    } catch (error) {
      if (isRejectedCredential(error, credential)) {
        throw new SourceUnavailableError({
          subtitleSource,
          cause: new Error('Token rejected after a fresh login.'),
        });
      }
      throw error;
    }
  }

  async function callWithAccount(credential, signal, accountCall) {
    const storedSession = await readStoredSession(credential);
    return sharedCredentialPool.callWithCredential({
      subtitleSource,
      credential: null,
      isBreakerOnEveryLimit: true,
      isPreferredCredential: appCredential =>
        isSessionPinnedTo(storedSession, appCredential),
      runCall: async appCredential =>
        callWithSession({
          credential,
          appCredential:
            opensubtitlesMapping.requireAppCredential(appCredential),
          storedSession,
          signal,
          sessionCall: session => accountCall(session, appCredential),
        }),
    });
  }

  function requestDownloadLink(subtitleRef, credential, signal) {
    return callWithAccount(
      credential,
      signal,
      async (session, appCredential) => {
        const response = await requestSubtitleSource({
          ...opensubtitlesMapping.buildDownloadRequest(subtitleRef, {
            credential,
            appCredential,
            session,
          }),
          signal,
        });
        try {
          return opensubtitlesMapping.toDownloadLink(
            response,
            toCredentialIds(credential),
          );
        } catch (error) {
          if (error instanceof SourceRateLimitError) {
            storeQuotaReport(
              credential,
              opensubtitlesMapping.toQuotaReport(response),
            );
          }
          throw error;
        }
      },
    );
  }

  async function fetchAccountQuota(credential, signal) {
    const quota = await callWithAccount(
      credential,
      signal,
      async (session, appCredential) => {
        const [response, cachedQuota] = await Promise.all([
          requestSubtitleSource({
            ...opensubtitlesMapping.buildQuotaRequest({
              credential,
              appCredential,
              session,
            }),
            signal,
          }),
          runStoreCall(() =>
            sessionStore.readOpensubtitlesQuota(
              toOpensubtitlesSessionKey(credential),
            ),
          ),
        ]);
        return opensubtitlesMapping.toQuota(
          response,
          cachedQuota,
          toCredentialIds(credential),
        );
      },
    );
    storeQuotaReport(credential, quota);
    return opensubtitlesMapping.toAccountCheck(quota);
  }

  async function checkApiKey(credential, signal) {
    return opensubtitlesMapping.toApiKeyCheck(
      await requestSubtitleSource({
        ...opensubtitlesMapping.buildFormatsRequest(credential),
        signal,
      }),
    );
  }

  return {
    subtitleSource,
    credentialKinds: [CredentialKind.ACCOUNT, CredentialKind.API_KEY],
    isSearchHashSensitive: true,
    downloadBudgets: [
      {
        budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
        windowMs: CREDENTIAL_DOWNLOAD_WINDOW,
        requestMax: CREDENTIAL_DOWNLOAD_MAX,
      },
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: APP_KEY_DOWNLOAD_WINDOW,
        requestMax: APP_KEY_DOWNLOAD_MAX,
      },
    ],
    isAvailable: () =>
      sharedCredentialPool.hasConfiguredCredential(subtitleSource),
    canSearchWithoutCredential: () =>
      sharedCredentialPool.hasUsableCredential(subtitleSource),
    canDownloadWithoutCredential: () => false,
    searchSubtitles(searchQuery, credential, {signal} = {}) {
      return sharedCredentialPool.callWithCredential({
        subtitleSource,
        credential: opensubtitlesMapping.isApiKeyCredential(credential)
          ? credential
          : null,
        isBreakerOnEveryLimit: true,
        runCall: async searchCredential => {
          const searchRequest = opensubtitlesMapping.buildSearchRequest(
            searchQuery,
            searchCredential,
          );
          if (searchRequest === null) {
            return null;
          }
          return opensubtitlesMapping.toSearchHits(
            await requestSubtitleSource({...searchRequest, signal}),
            searchQuery,
          );
        },
      });
    },
    async downloadSubtitle(subtitleRef, credential, {signal} = {}) {
      const accountCredential =
        opensubtitlesMapping.requireAccountCredential(credential);
      const downloadLink = await requestDownloadLink(
        subtitleRef,
        accountCredential,
        signal,
      );
      const download = opensubtitlesMapping.toDownload(
        await requestSubtitleSource({
          ...opensubtitlesMapping.buildFileRequest(downloadLink),
          signal,
        }),
        downloadLink,
      );
      storeQuotaReport(accountCredential, {
        quotaRemainingCount: downloadLink.quotaRemainingCount,
        quotaResetAt: downloadLink.quotaResetAt,
      });
      return download;
    },
    async checkCredential(credential, {signal} = {}) {
      if (!isAccount(credential)) {
        return checkApiKey(credential, signal);
      }
      try {
        return await fetchAccountQuota(credential, signal);
      } catch (error) {
        if (isRejectedCredential(error, credential)) {
          return opensubtitlesMapping.toCredentialCheck(
            CredentialStatus.INVALID,
          );
        }
        throw error;
      }
    },
    async readQuota(credential, {signal} = {}) {
      if (!isAccount(credential)) {
        return checkApiKey(credential, signal);
      }
      const cachedQuota = await runStoreCall(() =>
        sessionStore.readOpensubtitlesQuota(
          toOpensubtitlesSessionKey(credential),
        ),
      );
      return isQuotaComplete(cachedQuota)
        ? opensubtitlesMapping.toAccountCheck(cachedQuota)
        : fetchAccountQuota(credential, signal);
    },
  };
}

export const opensubtitlesClient = createOpensubtitlesClient({
  requestSubtitleSource: requestSite,
});
