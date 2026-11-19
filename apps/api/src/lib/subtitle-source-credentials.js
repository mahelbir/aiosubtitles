import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {listDownloadCredentialKinds} from '@repo/shared/lib/download-credential-kinds.js';
import {
  hasListImprovementSwitch,
  isListImprovementOn,
} from '@repo/shared/lib/list-improvement-switch.js';
import {openCredentialSecret} from './credential-secret.js';

const SEARCH_CREDENTIAL_KIND_TIERS = Object.freeze({
  [SubtitleSource.OPENSUBTITLES]: [
    [CredentialKind.API_KEY],
    [CredentialKind.ACCOUNT],
  ],
});

function openSecret({userConfigId, subtitleSource, sealedSecret}) {
  try {
    return openCredentialSecret({userConfigId, subtitleSource, sealedSecret});
  } catch {
    return null;
  }
}

export function readSearchCredentials({cachedUserConfig, client}) {
  return readSourceCredentials({
    cachedUserConfig,
    subtitleSource: client.subtitleSource,
    credentialKindTiers: SEARCH_CREDENTIAL_KIND_TIERS[
      client.subtitleSource
    ] ?? [client.credentialKinds],
  });
}

export async function readDownloadCredentials({
  cachedUserConfig,
  client,
  isBackground = false,
}) {
  if (client.isDownloadKeyless) {
    return [null];
  }
  const canUseWithoutCredential = await client.canDownloadWithoutCredential();
  if (isBackground && client.canUseSharedCredential) {
    return canUseWithoutCredential ? [null] : [];
  }
  return toCandidateCredentials({
    ...readSourceCredentials({
      cachedUserConfig,
      subtitleSource: client.subtitleSource,
      credentialKindTiers: [
        client.credentialKinds.filter(credentialKind =>
          listDownloadCredentialKinds(client.subtitleSource).includes(
            credentialKind,
          ),
        ),
      ],
    }),
    canUseWithoutCredential,
  });
}

export function applyListImprovementSwitch({
  cachedUserConfig,
  subtitleSource,
  credentials,
}) {
  const canUseUserCredential =
    !hasListImprovementSwitch(subtitleSource) ||
    isListImprovementOn({
      listImprovementSwitchStates:
        cachedUserConfig?.listImprovementSwitchStates,
      subtitleSource,
    });
  return canUseUserCredential
    ? credentials
    : credentials.filter(credential => credential === null);
}

function readSourceCredentials({
  cachedUserConfig,
  subtitleSource,
  credentialKindTiers,
}) {
  const configuredCredentials =
    cachedUserConfig?.credentials.filter(
      credential => credential.subtitleSource === subtitleSource,
    ) ?? [];
  const credentialKinds = credentialKindTiers.find(tierKinds =>
    configuredCredentials.some(({credentialKind}) =>
      tierKinds.includes(credentialKind),
    ),
  );
  return {
    credentials: credentialKinds
      ? readUsableCredentials({
          cachedUserConfig,
          subtitleSource,
          credentialKinds,
        })
      : [],
    hasConfiguredCredential: configuredCredentials.length > 0,
  };
}

export function toCandidateCredentials({
  credentials,
  hasConfiguredCredential,
  canUseWithoutCredential,
}) {
  if (typeof hasConfiguredCredential !== 'boolean') {
    throw new TypeError('hasConfiguredCredential must be a boolean.');
  }
  if (typeof canUseWithoutCredential !== 'boolean') {
    throw new TypeError('canUseWithoutCredential must be a boolean.');
  }
  const canUseKeyless =
    canUseWithoutCredential && !hasConfiguredCredential && !credentials.length;
  return canUseKeyless ? [null] : credentials;
}

export function readUsableCredentials({
  cachedUserConfig,
  subtitleSource,
  credentialKinds,
}) {
  return cachedUserConfig.credentials
    .filter(
      credential =>
        credential.subtitleSource === subtitleSource &&
        credentialKinds.includes(credential.credentialKind) &&
        credential.credentialStatus !== CredentialStatus.INVALID,
    )
    .toSorted(
      (leftCredential, rightCredential) =>
        leftCredential.credentialPosition - rightCredential.credentialPosition,
    )
    .flatMap(({credentialId, credentialKind, sealedSecret}) => {
      const credentialSecret = openSecret({
        userConfigId: cachedUserConfig.userConfigId,
        subtitleSource,
        sealedSecret,
      });
      return credentialSecret
        ? [{...credentialSecret, credentialId, credentialKind}]
        : [];
    });
}
