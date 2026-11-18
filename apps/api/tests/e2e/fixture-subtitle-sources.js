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
  OPENSUBTITLES_VALID_ACCOUNT,
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
    ...quota,
    quotaResetAt: null,
  };
}

const CREDENTIAL_CHECKS = new Map([
  [
    SubtitleSource.THESUBTITLEDB,
    async ({apiKey}) =>
      toCredentialCheck(apiKey === THESUBTITLEDB_VALID_API_KEY),
  ],
  [
    SubtitleSource.OPENSUBTITLES,
    async credential =>
      credential.credentialKind === CredentialKind.ACCOUNT &&
      isMatch(credential, OPENSUBTITLES_VALID_ACCOUNT)
        ? toCredentialCheck(true, OPENSUBTITLES_FIXTURE_QUOTA)
        : toCredentialCheck(false),
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
