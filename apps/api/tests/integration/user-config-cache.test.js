import {describe, expect, it} from 'vitest';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {sequelize} from '../../src/db/index.js';
import {UserConfigCredential} from '../../src/db/models/user-config-credential.js';
import {
  markCredentialStatus,
  openCredentialSecret,
  sealCredentialSecret,
} from '../../src/lib/credential-secret.js';
import {uuidV4} from '../../src/lib/common.js';
import {userConfigCache} from '../../src/lib/user-config-cache.js';
import {redis} from '../../src/redis/index.js';
import {
  DEFAULT_LANGUAGE_CODES,
  createUserConfig,
} from '../helpers/factories.js';

const PLAIN_API_KEY = 'plain-altyazidb-api-key';

const altyazidbCredential = {
  subtitleSource: SubtitleSource.ALTYAZIDB,
  credentialKind: CredentialKind.API_KEY,
  credentialSecret: {apiKey: PLAIN_API_KEY},
};

const opensubtitlesAccount = {
  subtitleSource: SubtitleSource.OPENSUBTITLES,
  credentialKind: CredentialKind.ACCOUNT,
  credentialSecret: {username: 'viewer', password: 'viewer-password'},
};

async function primeUserConfigCache(userConfigId) {
  await redis.flushdb();
  await userConfigCache.get(userConfigId);
  expect(await userConfigCache.peek(userConfigId)).toBeDefined();
}

async function primeWithBystander(userConfigId) {
  const {userConfig: bystander} = await createUserConfig();
  await primeUserConfigCache(userConfigId);
  await userConfigCache.get(bystander.id);
  expect(await userConfigCache.peek(bystander.id)).toBeDefined();
  return bystander;
}

describe('the configuration cache', () => {
  it('caches a configuration with sealed secrets', async () => {
    const {userConfig, userConfigCredentials} = await createUserConfig({
      subtitleSourceSwitchStates: {[SubtitleSource.ALTYAZIDB]: true},
      listImprovementSwitchStates: {[SubtitleSource.ALTYAZIDB]: false},
      credentials: [altyazidbCredential],
    });
    const [credential] = userConfigCredentials;

    await primeUserConfigCache(userConfig.id);

    const cached = await userConfigCache.peek(userConfig.id);
    expect(cached).toEqual({
      userConfigId: userConfig.id,
      languageCodes: DEFAULT_LANGUAGE_CODES,
      subtitleLanguageLimit: 10,
      subtitleSourceSwitchStates: {[SubtitleSource.ALTYAZIDB]: true},
      listImprovementSwitchStates: {[SubtitleSource.ALTYAZIDB]: false},
      credentials: [
        {
          credentialId: credential.id,
          subtitleSource: SubtitleSource.ALTYAZIDB,
          credentialKind: CredentialKind.API_KEY,
          sealedSecret: credential.credentialSecret,
          credentialPosition: 0,
          credentialStatus: CredentialStatus.UNCHECKED,
          credentialCheckedAt: null,
          quotaRemainingCount: null,
          quotaResetAt: null,
        },
      ],
    });
    expect(JSON.stringify(cached)).not.toContain(PLAIN_API_KEY);
    expect(
      openCredentialSecret({
        userConfigId: userConfig.id,
        subtitleSource: SubtitleSource.ALTYAZIDB,
        sealedSecret: cached.credentials[0].sealedSecret,
      }),
    ).toEqual(altyazidbCredential.credentialSecret);
  });

  it('caches an unknown id as null', async () => {
    const userConfigId = uuidV4();

    expect(await userConfigCache.get(userConfigId)).toBeNull();
    expect(await userConfigCache.peek(userConfigId)).toBeNull();
  });

  it('drops the cached configuration when a credential changes inside a transaction only after commit', async () => {
    const {userConfig, userConfigCredentials} = await createUserConfig({
      credentials: [altyazidbCredential],
    });
    const [credential] = userConfigCredentials;
    await primeUserConfigCache(userConfig.id);

    await sequelize.transaction(async transaction => {
      await credential.update(
        {credentialStatus: CredentialStatus.VALID},
        {transaction},
      );
      const during = await userConfigCache.peek(userConfig.id);
      expect(during.credentials[0].credentialStatus).toBe(
        CredentialStatus.UNCHECKED,
      );
    });

    expect(await userConfigCache.peek(userConfig.id)).toBeUndefined();
    const after = await userConfigCache.get(userConfig.id);
    expect(after.credentials[0].credentialStatus).toBe(CredentialStatus.VALID);
  });
});

describe('the configuration cache invalidation', () => {
  it('drops the cached configuration when the configuration is updated', async () => {
    const {userConfig} = await createUserConfig();
    await primeUserConfigCache(userConfig.id);

    await userConfig.update({subtitleLanguageLimit: 5});

    expect(await userConfigCache.peek(userConfig.id)).toBeUndefined();
    expect(
      (await userConfigCache.get(userConfig.id)).subtitleLanguageLimit,
    ).toBe(5);
  });

  it('drops the cached configuration when the configuration is destroyed', async () => {
    const {userConfig} = await createUserConfig();
    await primeUserConfigCache(userConfig.id);

    await userConfig.destroy();

    expect(await userConfigCache.peek(userConfig.id)).toBeUndefined();
    expect(await userConfigCache.get(userConfig.id)).toBeNull();
  });

  it('drops the cached configuration when a credential loaded without its configuration id changes', async () => {
    const {userConfig, userConfigCredentials} = await createUserConfig({
      credentials: [altyazidbCredential],
    });
    const bystander = await primeWithBystander(userConfig.id);
    const credential = await UserConfigCredential.findByPk(
      userConfigCredentials[0].id,
      {attributes: ['id']},
    );

    await credential.update({credentialStatus: CredentialStatus.VALID});

    expect(await userConfigCache.peek(userConfig.id)).toBeUndefined();
    expect(await userConfigCache.peek(bystander.id)).toBeDefined();
  });

  it('drops the cached configuration when a credential loaded without its configuration id is destroyed', async () => {
    const {userConfig, userConfigCredentials} = await createUserConfig({
      credentials: [altyazidbCredential],
    });
    const bystander = await primeWithBystander(userConfig.id);
    const credential = await UserConfigCredential.findByPk(
      userConfigCredentials[0].id,
      {attributes: ['id']},
    );

    await credential.destroy();

    expect(await userConfigCache.peek(userConfig.id)).toBeUndefined();
    expect(await userConfigCache.peek(bystander.id)).toBeDefined();
    expect((await userConfigCache.get(userConfig.id)).credentials).toEqual([]);
  });

  it('orders the cached credentials by their position', async () => {
    const {userConfig} = await createUserConfig({
      credentials: [
        opensubtitlesAccount,
        altyazidbCredential,
        opensubtitlesAccount,
      ],
    });

    const cached = await userConfigCache.get(userConfig.id);

    expect(
      cached.credentials.map(credential => [
        credential.credentialPosition,
        credential.subtitleSource,
      ]),
    ).toEqual([
      [0, SubtitleSource.OPENSUBTITLES],
      [1, SubtitleSource.ALTYAZIDB],
      [2, SubtitleSource.OPENSUBTITLES],
    ]);
  });
});

describe('a credential status mark', () => {
  it('marks a credential inside the transaction that created it', async () => {
    const {userConfig} = await createUserConfig();

    const credentialId = await sequelize.transaction(async transaction => {
      const credential = await UserConfigCredential.create(
        {
          userConfigId: userConfig.id,
          subtitleSource: SubtitleSource.OPENSUBTITLES,
          credentialKind: CredentialKind.ACCOUNT,
          credentialSecret: sealCredentialSecret({
            userConfigId: userConfig.id,
            subtitleSource: SubtitleSource.OPENSUBTITLES,
            credentialSecret: opensubtitlesAccount.credentialSecret,
          }),
          credentialPosition: 0,
        },
        {transaction},
      );
      await markCredentialStatus({
        credentialId: credential.id,
        credentialStatus: CredentialStatus.VALID,
        transaction,
      });
      return credential.id;
    });

    const stored = await UserConfigCredential.findByPk(credentialId, {
      attributes: ['credentialStatus', 'credentialCheckedAt'],
    });
    expect(stored.credentialStatus).toBe(CredentialStatus.VALID);
    expect(stored.credentialCheckedAt).toBeInstanceOf(Date);
  });

  it('marks a credential limited with its quota', async () => {
    const {userConfig, userConfigCredentials} = await createUserConfig({
      credentials: [opensubtitlesAccount],
    });
    const [credential] = userConfigCredentials;
    await primeUserConfigCache(userConfig.id);
    const quotaResetAt = new Date('2026-11-19T00:00:00.000Z');

    await markCredentialStatus({
      credentialId: credential.id,
      credentialStatus: CredentialStatus.LIMITED,
      quotaRemainingCount: 0,
      quotaResetAt,
    });

    const stored = await UserConfigCredential.findByPk(credential.id, {
      attributes: [
        'credentialStatus',
        'credentialCheckedAt',
        'quotaRemainingCount',
        'quotaResetAt',
      ],
    });
    expect(stored.credentialStatus).toBe(CredentialStatus.LIMITED);
    expect(stored.credentialCheckedAt).toBeInstanceOf(Date);
    expect(stored.quotaRemainingCount).toBe(0);
    expect(stored.quotaResetAt).toEqual(quotaResetAt);

    const cached = await userConfigCache.get(userConfig.id);
    expect(cached.credentials[0]).toMatchObject({
      credentialStatus: CredentialStatus.LIMITED,
      quotaRemainingCount: 0,
    });
  });
});

describe('a sealed credential secret', () => {
  it('opens a sealed secret only under its own configuration and source', () => {
    const userConfigId = uuidV4();
    const sealedSecret = sealCredentialSecret({
      userConfigId,
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      credentialSecret: opensubtitlesAccount.credentialSecret,
    });

    expect(sealedSecret).toBeTypeOf('string');
    expect(sealedSecret).not.toContain(
      opensubtitlesAccount.credentialSecret.password,
    );
    expect(
      openCredentialSecret({
        userConfigId,
        subtitleSource: SubtitleSource.OPENSUBTITLES,
        sealedSecret,
      }),
    ).toEqual(opensubtitlesAccount.credentialSecret);
    expect(
      openCredentialSecret({
        userConfigId: uuidV4(),
        subtitleSource: SubtitleSource.OPENSUBTITLES,
        sealedSecret,
      }),
    ).toBeNull();
    expect(
      openCredentialSecret({
        userConfigId,
        subtitleSource: SubtitleSource.SUBDL,
        sealedSecret,
      }),
    ).toBeNull();
    expect(
      openCredentialSecret({
        userConfigId,
        subtitleSource: SubtitleSource.OPENSUBTITLES,
        sealedSecret: 'not-a-sealed-secret',
      }),
    ).toBeNull();
  });
});
