import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {deriveSecretKey, fingerprintSecret} from '../../crypto.js';
import {createLogger} from '../../logger.js';
import {MemoryStore} from '../../memory-store.js';
import {SubtitleSourceBudgetScope} from '../subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceUnavailableError,
} from '../subtitle-source-errors.js';
import {readSettledHitLists} from '../subtitle-source-hit-lists.js';
import {requestSubtitleSource as requestSite} from '../subtitle-source-request.js';
import {wyzieMapping} from './wyzie-mapping.js';

const CREDENTIAL_DOWNLOAD_WINDOW = 86400000;
const CREDENTIAL_DOWNLOAD_MAX = 1000;
const KEY_PLAN_TTL = 3600;
const KEY_PLAN_PREFIX = 'wyzie-key-plan:';
const UNKNOWN_KEY_PLAN_RETRY_MS = 60000;

const keyPlanFingerprintKey = deriveSecretKey('wyzie-key-plan');

function toKeyPlanKey(credential) {
  return `${KEY_PLAN_PREFIX}${fingerprintSecret(credential.apiKey, keyPlanFingerprintKey)}`;
}

export function createWyzieClient({
  requestSubtitleSource,
  availableCodenamesStore = new MemoryStore({ttl: () => KEY_PLAN_TTL}),
  logger = createLogger('wyzie'),
}) {
  async function fetchAvailableCodenames(credential, signal) {
    try {
      return wyzieMapping.toKeyScope(
        await requestSubtitleSource({
          ...wyzieMapping.buildCredentialCheckRequest(credential),
          signal,
        }),
      );
    } catch (error) {
      if (!(error instanceof SourceUnavailableError)) {
        throw error;
      }
      logger.warn(
        {errorName: error.name},
        'Wyzie key plan lookup failed, searching the default sources.',
      );
      return {isKeyValid: null, availableCodenames: null};
    }
  }

  async function readAvailableCodenames(credential, signal) {
    const keyPlanKey = toKeyPlanKey(credential);
    const storedPlan = await availableCodenamesStore.get(keyPlanKey);
    if (storedPlan && (storedPlan.retryAt ?? Infinity) > Date.now()) {
      return storedPlan.availableCodenames;
    }
    const {isKeyValid, availableCodenames} = await fetchAvailableCodenames(
      credential,
      signal,
    );
    if (isKeyValid === false) {
      throw new SourceCredentialError({
        subtitleSource: SubtitleSource.WYZIE,
        credentialId: credential.credentialId,
      });
    }
    const isPlanKnown = isKeyValid && availableCodenames !== null;
    await availableCodenamesStore.set(keyPlanKey, {
      availableCodenames: isPlanKnown ? availableCodenames : null,
      retryAt: isPlanKnown ? null : Date.now() + UNKNOWN_KEY_PLAN_RETRY_MS,
    });
    return isPlanKnown ? availableCodenames : null;
  }

  async function searchCodename({searchQuery, credential, codename, signal}) {
    const codenames = [codename];
    return wyzieMapping.toSearchHits(
      await requestSubtitleSource({
        ...wyzieMapping.buildSearchRequest(searchQuery, credential, codenames),
        signal,
      }),
      {searchQuery, credential, codenames},
    );
  }

  async function requestFile(downloadUrl, credential, signal) {
    try {
      return await requestSubtitleSource({
        ...wyzieMapping.buildDownloadRequest(downloadUrl, credential),
        signal,
      });
    } catch (error) {
      throw wyzieMapping.toFileLinkError(error);
    }
  }

  return {
    subtitleSource: SubtitleSource.WYZIE,
    credentialKinds: [CredentialKind.API_KEY],
    isSearchHashSensitive: true,
    downloadBudgets: [
      {
        budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
        windowMs: CREDENTIAL_DOWNLOAD_WINDOW,
        requestMax: CREDENTIAL_DOWNLOAD_MAX,
      },
    ],
    canSearchWithoutCredential: () => false,
    canDownloadWithoutCredential: () => false,
    async searchSubtitles(searchQuery, credential, {signal} = {}) {
      const defaultCodenames = wyzieMapping.listSearchCodenames(
        searchQuery,
        null,
      );
      if (
        wyzieMapping.buildSearchRequest(
          searchQuery,
          credential,
          defaultCodenames,
        ) === null
      ) {
        return null;
      }
      const codenames = wyzieMapping.listSearchCodenames(
        searchQuery,
        await readAvailableCodenames(credential, signal),
      );
      if (codenames.length === 0) {
        return null;
      }
      const settledResults = await Promise.allSettled(
        codenames.map(codename =>
          searchCodename({searchQuery, credential, codename, signal}),
        ),
      );
      return readSettledHitLists(settledResults, {isPartialKept: true}).flat();
    },
    async downloadSubtitle(subtitleRef, credential, {signal} = {}) {
      const downloadUrl = wyzieMapping.findDownloadUrl(
        await requestSubtitleSource({
          ...wyzieMapping.buildDownloadSearchRequest(subtitleRef, credential),
          signal,
        }),
        subtitleRef,
        {credential},
      );
      return wyzieMapping.toDownload(
        await requestFile(downloadUrl, credential, signal),
        credential,
        {languageCode: wyzieMapping.readRecipeLanguageCode(subtitleRef)},
      );
    },
    async checkCredential(credential, {signal} = {}) {
      return wyzieMapping.toCredentialCheck(
        await requestSubtitleSource({
          ...wyzieMapping.buildCredentialCheckRequest(credential),
          signal,
        }),
        credential,
      );
    },
    async readQuota(credential, {signal} = {}) {
      return wyzieMapping.toQuota(
        await requestSubtitleSource({
          ...wyzieMapping.buildQuotaRequest(credential),
          signal,
        }),
      );
    },
  };
}

export const wyzieClient = createWyzieClient({
  requestSubtitleSource: requestSite,
});
