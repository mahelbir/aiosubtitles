import {pick} from 'es-toolkit';
import {isMatch} from 'es-toolkit/compat';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  createSubtitleSourceRegistry,
  listSubtitleSourceClients,
} from '../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {
  OPENSUBTITLES_FIXTURE_QUOTA,
  OPENSUBTITLES_PAST_QUOTA_RESET_AT,
  OPENSUBTITLES_STALE_QUOTA_ACCOUNT,
  OPENSUBTITLES_VALID_ACCOUNT,
  THESUBTITLEDB_LATE_API_KEY_PREFIX,
  THESUBTITLEDB_VALID_API_KEY,
} from './fixture-credentials.js';

const SHIPPED_CLIENT_FIELDS = [
  'subtitleSource',
  'credentialKinds',
  'isSearchHashSensitive',
  'downloadBudgets',
];

const UNCOUNTED_QUOTA = Object.freeze({
  quotaRemainingCount: null,
  quotaAllowedCount: null,
});

function toCredentialCheck(isValid, quota = UNCOUNTED_QUOTA) {
  return {
    credentialStatus: isValid
      ? CredentialStatus.VALID
      : CredentialStatus.INVALID,
    quotaResetAt: null,
    ...quota,
  };
}

function checkOpensubtitlesAccount(credential) {
  if (credential.credentialKind !== CredentialKind.ACCOUNT) {
    return toCredentialCheck(false);
  }
  if (isMatch(credential, OPENSUBTITLES_VALID_ACCOUNT)) {
    return toCredentialCheck(true, OPENSUBTITLES_FIXTURE_QUOTA);
  }
  if (isMatch(credential, OPENSUBTITLES_STALE_QUOTA_ACCOUNT)) {
    return toCredentialCheck(true, {
      ...OPENSUBTITLES_FIXTURE_QUOTA,
      quotaResetAt: OPENSUBTITLES_PAST_QUOTA_RESET_AT,
    });
  }
  return toCredentialCheck(false);
}

const checkedLateApiKeys = new Set();

function checkLateApiKey(apiKey) {
  if (!checkedLateApiKeys.has(apiKey)) {
    checkedLateApiKeys.add(apiKey);
    throw new Error('E2E fixture source misses its first credential check.');
  }
  return toCredentialCheck(true);
}

const CREDENTIAL_CHECKS = new Map([
  [
    SubtitleSource.THESUBTITLEDB,
    async ({apiKey}) => {
      if (apiKey.startsWith(THESUBTITLEDB_LATE_API_KEY_PREFIX)) {
        return checkLateApiKey(apiKey);
      }
      return toCredentialCheck(apiKey === THESUBTITLEDB_VALID_API_KEY);
    },
  ],
  [
    SubtitleSource.OPENSUBTITLES,
    async credential => checkOpensubtitlesAccount(credential),
  ],
]);

function toFixtureClient(shippedClient) {
  const checkCredential = CREDENTIAL_CHECKS.get(shippedClient.subtitleSource);
  return {
    ...pick(shippedClient, SHIPPED_CLIENT_FIELDS),
    canSearchWithoutCredential: () => true,
    canDownloadWithoutCredential: () => true,
    searchSubtitles: async () => [],
    downloadSubtitle: async () => {
      throw new Error('E2E fixture sources serve no subtitle files.');
    },
    ...(checkCredential && {checkCredential}),
  };
}

export function createFixtureSubtitleSourceRegistry() {
  return createSubtitleSourceRegistry(
    listSubtitleSourceClients().map(toFixtureClient),
  );
}
