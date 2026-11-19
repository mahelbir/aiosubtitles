import crypto from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {sealCredentialSecret} from '../../src/lib/credential-secret.js';
import {
  applyListImprovementSwitch,
  readDownloadCredentials,
  readSearchCredentials,
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

describe('readSearchCredentials', () => {
  it("gives a keyed search the user's own key", () => {
    expect(
      readSearchCredentials({
        cachedUserConfig: keyedUserConfig,
        client: makeClient({canUseSharedCredential: true, hasServerPath: true}),
      }),
    ).toEqual({
      credentials: [expect.objectContaining({apiKey: USER_KEY})],
      hasConfiguredCredential: true,
    });
  });

  it('never moves a search that sends no key to the keyless path for a user whose key is unusable', () => {
    const unusableUserConfig = {
      ...keyedUserConfig,
      credentials: keyedUserConfig.credentials.map(credential => ({
        ...credential,
        credentialStatus: CredentialStatus.INVALID,
      })),
    };
    const searchCredentials = readSearchCredentials({
      cachedUserConfig: unusableUserConfig,
      client: {
        ...makeClient({canUseSharedCredential: true, hasServerPath: true}),
        isSearchKeyless: true,
      },
    });

    expect(
      toCandidateCredentials({
        ...searchCredentials,
        canUseWithoutCredential: true,
      }),
    ).toEqual([]);
  });
});

describe('applyListImprovementSwitch', () => {
  function makeSwitchedUserConfig(subtitleSource, listImprovementSwitchStates) {
    return {
      userConfigId,
      listImprovementSwitchStates,
      credentials: [
        {
          credentialId: crypto.randomUUID(),
          subtitleSource,
          credentialKind: CredentialKind.API_KEY,
          credentialStatus: CredentialStatus.VALID,
          credentialPosition: 0,
          sealedSecret: sealCredentialSecret({
            userConfigId,
            subtitleSource,
            credentialSecret: {apiKey: USER_KEY},
          }),
        },
      ],
    };
  }

  const userCredential = {credentialId: 'fixture-credential', apiKey: USER_KEY};

  function applySwitch(subtitleSource, listImprovementSwitchStates) {
    return applyListImprovementSwitch({
      cachedUserConfig: {userConfigId, listImprovementSwitchStates},
      subtitleSource,
      credentials: [userCredential],
    });
  }

  it.each([SubtitleSource.SUBSOURCE, SubtitleSource.WYZIE])(
    "keeps the user's key for %s while its switch is on by default",
    subtitleSource => {
      expect(applySwitch(subtitleSource, {})).toEqual([userCredential]);
    },
  );

  it.each([SubtitleSource.SUBSOURCE, SubtitleSource.ALTYAZIDB])(
    "drops the user's key for %s once its switch is off",
    subtitleSource => {
      expect(applySwitch(subtitleSource, {[subtitleSource]: false})).toEqual(
        [],
      );
    },
  );

  it("drops the user's SubDL key while its switch is off by default", () => {
    expect(applySwitch(SubtitleSource.SUBDL, {})).toEqual([]);
  });

  it("keeps the user's SubDL key once its switch is turned on", () => {
    expect(
      applySwitch(SubtitleSource.SUBDL, {[SubtitleSource.SUBDL]: true}),
    ).toEqual([userCredential]);
  });

  it("drops the user's OpenSubtitles account while its switch is off by default", () => {
    expect(applySwitch(SubtitleSource.OPENSUBTITLES, {})).toEqual([]);
  });

  it('keeps a keyless path while the switch is off', () => {
    expect(
      applyListImprovementSwitch({
        cachedUserConfig: {
          userConfigId,
          listImprovementSwitchStates: {
            [SubtitleSource.SUBSOURCE]: false,
          },
        },
        subtitleSource: SubtitleSource.SUBSOURCE,
        credentials: [null, userCredential],
      }),
    ).toEqual([null]);
  });

  it("keeps the user's key for a source without a switch", () => {
    expect(
      applySwitch(SubtitleSource.JIMAKU, {[SubtitleSource.JIMAKU]: false}),
    ).toEqual([userCredential]);
  });

  it("leaves the background credential read to the job, keeping the user's key with the switch off", async () => {
    await expect(
      readDownloadCredentials({
        cachedUserConfig: makeSwitchedUserConfig(SubtitleSource.SUBSOURCE, {
          [SubtitleSource.SUBSOURCE]: false,
        }),
        client: {
          subtitleSource: SubtitleSource.SUBSOURCE,
          credentialKinds: [CredentialKind.API_KEY],
          canDownloadWithoutCredential: () => false,
        },
        isBackground: true,
      }),
    ).resolves.toEqual([expect.objectContaining({apiKey: USER_KEY})]);
  });
});
