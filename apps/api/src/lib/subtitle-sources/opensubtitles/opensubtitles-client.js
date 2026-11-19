import {isNil} from 'es-toolkit';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {config} from '../../../config/index.js';
import {createLogger} from '../../logger.js';
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
import {toOpensubtitlesSessionKey} from './opensubtitles-session.js';

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
  apiKey,
  sessionStore = opensubtitlesSession,
  logger = opensubtitlesLogger,
}) {
  const sessionBySessionKey = new Map();

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

  async function logIn(credential) {
    const session = opensubtitlesMapping.toSession(
      await requestSubtitleSource(
        opensubtitlesMapping.buildLoginRequest(credential, {apiKey}),
      ),
      {credentialId: credential.credentialId},
    );
    await runStoreCall(() =>
      sessionStore.storeOpensubtitlesSession(
        toOpensubtitlesSessionKey(credential),
        session,
      ),
    );
    return session;
  }

  async function loadSession(credential) {
    return (
      (await runStoreCall(() =>
        sessionStore.readOpensubtitlesSession(
          toOpensubtitlesSessionKey(credential),
        ),
      )) ?? logIn(credential)
    );
  }

  function getSession(credential, signal) {
    const sessionKey = toOpensubtitlesSessionKey(credential);
    let sessionPromise = sessionBySessionKey.get(sessionKey);
    if (!sessionPromise) {
      sessionPromise = loadSession(credential).finally(() => {
        sessionBySessionKey.delete(sessionKey);
      });
      sessionBySessionKey.set(sessionKey, sessionPromise);
    }
    return awaitUnlessAborted(sessionPromise, signal);
  }

  async function refreshSession(credential, staleSession, signal) {
    const sessionKey = toOpensubtitlesSessionKey(credential);
    const storedSession = await runStoreCall(() =>
      sessionStore.readOpensubtitlesSession(sessionKey),
    );
    if (storedSession && storedSession.token !== staleSession.token) {
      return storedSession;
    }
    await runStoreCall(() => sessionStore.dropOpensubtitlesSession(sessionKey));
    return getSession(credential, signal);
  }

  async function callWithSession(credential, signal, sessionCall) {
    const session = await getSession(credential, signal);
    try {
      return await sessionCall(session);
    } catch (error) {
      if (!(error instanceof SourceCredentialError)) {
        throw error;
      }
    }
    const freshSession = await refreshSession(credential, session, signal);
    try {
      return await sessionCall(freshSession);
    } catch (error) {
      if (error instanceof SourceCredentialError) {
        throw new SourceUnavailableError({
          subtitleSource: SubtitleSource.OPENSUBTITLES,
          cause: new Error('Token rejected after a fresh login.'),
        });
      }
      throw error;
    }
  }

  async function requestDownloadLink(subtitleRef, credential, signal) {
    const {credentialId} = credential;
    return callWithSession(credential, signal, async session => {
      const response = await requestSubtitleSource({
        ...opensubtitlesMapping.buildDownloadRequest(subtitleRef, {
          credential,
          apiKey,
          session,
        }),
        signal,
      });
      try {
        return opensubtitlesMapping.toDownloadLink(response, {credentialId});
      } catch (error) {
        if (error instanceof SourceRateLimitError) {
          storeQuotaReport(
            credential,
            opensubtitlesMapping.toQuotaReport(response),
          );
        }
        throw error;
      }
    });
  }

  async function fetchAccountQuota(credential, signal) {
    const {credentialId} = credential;
    const quota = await callWithSession(credential, signal, async session => {
      const [response, cachedQuota] = await Promise.all([
        requestSubtitleSource({
          ...opensubtitlesMapping.buildQuotaRequest({
            credential,
            apiKey,
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
      return opensubtitlesMapping.toQuota(response, cachedQuota, {
        credentialId,
      });
    });
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
    subtitleSource: SubtitleSource.OPENSUBTITLES,
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
    canSearchWithoutCredential: () => Boolean(apiKey),
    canDownloadWithoutCredential: () => false,
    async searchSubtitles(searchQuery, credential, {signal} = {}) {
      const searchRequest = opensubtitlesMapping.buildSearchRequest(
        searchQuery,
        {credential, apiKey},
      );
      if (searchRequest === null) {
        return null;
      }
      return opensubtitlesMapping.toSearchHits(
        await requestSubtitleSource({...searchRequest, signal}),
        searchQuery,
      );
    },
    async downloadSubtitle(subtitleRef, credential, {signal} = {}) {
      const accountCredential =
        opensubtitlesMapping.requireAccountCredential(credential);
      opensubtitlesMapping.requireApiKey(apiKey);
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
      opensubtitlesMapping.requireApiKey(apiKey);
      try {
        return await fetchAccountQuota(credential, signal);
      } catch (error) {
        if (error instanceof SourceCredentialError) {
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
      opensubtitlesMapping.requireApiKey(apiKey);
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
  apiKey: config.opensubtitlesApiKey,
});
