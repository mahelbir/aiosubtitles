import crypto from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {sealCredentialSecret} from '../../src/lib/credential-secret.js';
import {
  readDownloadCredentials,
  toCandidateCredentials,
} from '../../src/lib/subtitle-source-credentials.js';

const USER_KEY = 'user-own-fixture-key';
const userConfigId = crypto.randomUUID();
const keyedUserConfig = {
  userConfigId,
  credentials: [
    {
      credentialId: crypto.randomUUID(),
      subtitleSource: SubtitleSource.JIMAKU,
      credentialKind: CredentialKind.API_KEY,
      credentialStatus: CredentialStatus.VALID,
      credentialPosition: 0,
      sealedSecret: sealCredentialSecret({
        userConfigId,
        subtitleSource: SubtitleSource.JIMAKU,
        credentialSecret: {apiKey: USER_KEY},
      }),
    },
  ],
};

function makeClient({canUseSharedCredential, hasServerPath}) {
  return {
    subtitleSource: SubtitleSource.JIMAKU,
    credentialKinds: [CredentialKind.API_KEY],
    canUseSharedCredential,
    canDownloadWithoutCredential: async () => hasServerPath,
  };
}

describe('toCandidateCredentials', () => {
  it('refuses a keyless answer that is still a promise, which would read as always keyless', () => {
    expect(() =>
      toCandidateCredentials({
        credentials: [],
        hasConfiguredCredential: false,
        canUseWithoutCredential: Promise.resolve(false),
      }),
    ).toThrow(TypeError);
  });

  it('refuses a configured flag that is not a boolean', () => {
    expect(() =>
      toCandidateCredentials({
        credentials: [],
        hasConfiguredCredential: undefined,
        canUseWithoutCredential: true,
      }),
    ).toThrow(TypeError);
  });
});

describe('readDownloadCredentials', () => {
  it("gives a foreground download the user's own key", async () => {
    await expect(
      readDownloadCredentials({
        cachedUserConfig: keyedUserConfig,
        client: makeClient({canUseSharedCredential: true, hasServerPath: true}),
      }),
    ).resolves.toEqual([expect.objectContaining({apiKey: USER_KEY})]);
  });

  it('gives background work of a shared-credential source the server path, never the user key', async () => {
    await expect(
      readDownloadCredentials({
        cachedUserConfig: keyedUserConfig,
        client: makeClient({canUseSharedCredential: true, hasServerPath: true}),
        isBackground: true,
      }),
    ).resolves.toEqual([null]);
  });

  it('gives background work of a shared-credential source nothing while the server has no path', async () => {
    await expect(
      readDownloadCredentials({
        cachedUserConfig: keyedUserConfig,
        client: makeClient({
          canUseSharedCredential: true,
          hasServerPath: false,
        }),
        isBackground: true,
      }),
    ).resolves.toEqual([]);
  });

  it('gives a keyless file download the keyless path in the foreground too, even for a user whose key is unusable', async () => {
    const keylessDownloadClient = {
      ...makeClient({canUseSharedCredential: true, hasServerPath: true}),
      isDownloadKeyless: true,
    };
    const unusableUserConfig = {
      ...keyedUserConfig,
      credentials: keyedUserConfig.credentials.map(credential => ({
        ...credential,
        credentialStatus: CredentialStatus.INVALID,
      })),
    };

    await expect(
      Promise.all([
        readDownloadCredentials({
          cachedUserConfig: keyedUserConfig,
          client: keylessDownloadClient,
        }),
        readDownloadCredentials({
          cachedUserConfig: unusableUserConfig,
          client: keylessDownloadClient,
        }),
      ]),
    ).resolves.toEqual([[null], [null]]);
  });

  it("keeps the user's key for background work of any other source", async () => {
    await expect(
      readDownloadCredentials({
        cachedUserConfig: keyedUserConfig,
        client: makeClient({
          canUseSharedCredential: false,
          hasServerPath: false,
        }),
        isBackground: true,
      }),
    ).resolves.toEqual([expect.objectContaining({apiKey: USER_KEY})]);
  });
});
