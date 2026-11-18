import {beforeEach, describe, expect, it, vi} from 'vitest';
import {sortBy} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {
  CredentialRequirement,
  SubtitleSource,
} from '@repo/shared/constants/subtitle-source.js';
import {UserConfigCredential} from '../../src/db/models/user-config-credential.js';
import {UserConfig} from '../../src/db/models/user-config.js';
import {uuidV4} from '../../src/lib/common.js';
import {createSubtitleSourceRegistry} from '../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SourceUnavailableError} from '../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {
  getTestApp,
  getTestAppBasePath,
  setTestAppOptions,
} from '../helpers/app.js';
import {readEnvelope} from '../helpers/assertions.js';
import {createUserConfig} from '../helpers/factories.js';
import {createFixtureSubtitleSourceClient} from '../helpers/fixture-subtitle-source.js';
import {
  USER_CONFIGS_URL,
  callUserConfigApi,
  login,
} from '../helpers/user-config-api.js';
import {makeSwitchStatesOnly} from '../helpers/user-config-factories.js';

const PASSWORD = 'correct horse';
const WRONG_PASSWORD = 'wrong horse';
const UNKNOWN_UUID_V4 = uuidV4();
const API_KEY = 'sdb_fixturekey1234';
const ACCOUNT_USERNAME = 'fixture-user';
const ACCOUNT_PASSWORD = 'fixture-pass-9876';
const LOGIN_REFUSAL = 'Wrong configuration ID or password.';
const SESSION_REFUSAL = 'Your session expired. Enter your password again.';

const VALID_CHECK = {
  credentialStatus: CredentialStatus.VALID,
  quotaRemainingCount: 42,
  quotaAllowedCount: 100,
  quotaResetAt: null,
};

const checkThesubtitledbCredential = vi.fn();
const checkOpensubtitlesCredential = vi.fn();

setTestAppOptions({
  subtitleSourceRegistry: createSubtitleSourceRegistry([
    createFixtureSubtitleSourceClient({
      subtitleSource: SubtitleSource.THESUBTITLEDB,
      credentialKinds: [CredentialKind.API_KEY],
      checkCredential: checkThesubtitledbCredential,
    }),
    createFixtureSubtitleSourceClient({
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      credentialKinds: [CredentialKind.ACCOUNT, CredentialKind.API_KEY],
      checkCredential: checkOpensubtitlesCredential,
    }),
    createFixtureSubtitleSourceClient({
      subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
      credentialKinds: [CredentialKind.ACCESS_TOKEN],
    }),
  ]),
});

const SWITCH_STATES = makeSwitchStatesOnly([
  SubtitleSource.THESUBTITLEDB,
  SubtitleSource.OPENSUBTITLES,
]);

const apiKeyCredential = apiKey => ({
  subtitleSource: SubtitleSource.THESUBTITLEDB,
  credentialKind: CredentialKind.API_KEY,
  credentialSecret: {apiKey},
});

beforeEach(() => {
  for (const check of [
    checkThesubtitledbCredential,
    checkOpensubtitlesCredential,
  ]) {
    check.mockReset();
    check.mockResolvedValue(VALID_CHECK);
  }
});

function seedUserConfig(credentials = []) {
  return createUserConfig({
    password: PASSWORD,
    languageCodes: ['tur'],
    subtitleSourceSwitchStates: SWITCH_STATES,
    credentials,
  });
}

async function openSession(userConfigId, password = PASSWORD) {
  const response = await login(userConfigId, password);
  expect(response.statusCode).toBe(StatusCodes.OK);
  return readEnvelope(response).data.sessionToken;
}

async function readStoredCredentials(userConfigId) {
  return UserConfigCredential.findAll({
    attributes: ['id', 'credentialSecret', 'credentialStatus'],
    where: {userConfigId},
  });
}

function patchCredentials({userConfigId, sessionToken, credentials}) {
  return callUserConfigApi({
    method: 'PATCH',
    url: `${USER_CONFIGS_URL}/${userConfigId}`,
    payload: {credentials},
    sessionToken,
  });
}

describe('creating a configuration', () => {
  it('creates a configuration, seals its key and opens a session', async () => {
    const response = await callUserConfigApi({
      method: 'POST',
      url: USER_CONFIGS_URL,
      payload: {
        password: PASSWORD,
        languageCodes: ['tur'],
        subtitleSourceSwitchStates: SWITCH_STATES,
        credentials: [apiKeyCredential(API_KEY)],
      },
    });

    expect(response.statusCode).toBe(StatusCodes.CREATED);
    const {data} = readEnvelope(response);
    expect(data.manifestUrl).toBe(
      `http://localhost:80/${data.userConfigId}/manifest.json`,
    );
    const stored = await UserConfigCredential.findOne({
      attributes: ['credentialSecret', 'credentialStatus'],
      where: {userConfigId: data.userConfigId},
    });
    expect(stored.credentialSecret).not.toContain(API_KEY);
    expect(stored.credentialStatus).toBe(CredentialStatus.VALID);
    expect(checkThesubtitledbCredential).toHaveBeenCalledWith(
      expect.objectContaining({apiKey: API_KEY}),
      expect.anything(),
    );

    const read = await callUserConfigApi({
      method: 'GET',
      url: `${USER_CONFIGS_URL}/${data.userConfigId}`,
      sessionToken: data.sessionToken,
    });
    expect(read.statusCode).toBe(StatusCodes.OK);
  });
});

describe('opening a session', () => {
  it('answers a wrong id and a wrong password alike', async () => {
    const {userConfig} = await seedUserConfig();

    const unknown = await login(UNKNOWN_UUID_V4, PASSWORD);
    const wrong = await login(userConfig.id, WRONG_PASSWORD);

    expect([unknown.statusCode, wrong.statusCode]).toEqual([
      StatusCodes.UNAUTHORIZED,
      StatusCodes.UNAUTHORIZED,
    ]);
    expect(readEnvelope(unknown).message).toBe(LOGIN_REFUSAL);
    expect(readEnvelope(wrong).message).toBe(readEnvelope(unknown).message);
  });

  it('opens a session for the right password', async () => {
    const {userConfig} = await seedUserConfig();

    const response = await login(userConfig.id, PASSWORD);

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(readEnvelope(response).data.sessionToken).toEqual(
      expect.any(String),
    );
  });

  it('refuses a session token issued for another configuration', async () => {
    const [{userConfig: own}, {userConfig: other}] = await Promise.all([
      seedUserConfig(),
      seedUserConfig(),
    ]);
    const sessionToken = await openSession(own.id);

    const foreign = await callUserConfigApi({
      method: 'GET',
      url: `${USER_CONFIGS_URL}/${other.id}`,
      sessionToken,
    });
    const missing = await callUserConfigApi({
      method: 'GET',
      url: `${USER_CONFIGS_URL}/${own.id}`,
    });

    expect([foreign.statusCode, missing.statusCode]).toEqual([
      StatusCodes.UNAUTHORIZED,
      StatusCodes.UNAUTHORIZED,
    ]);
    expect(readEnvelope(foreign).message).toBe(SESSION_REFUSAL);
    expect(readEnvelope(missing).message).toBe(SESSION_REFUSAL);
  });
});

describe('reading a configuration', () => {
  it('masks keys and never returns a password', async () => {
    const {userConfig, userConfigCredentials} = await seedUserConfig([
      apiKeyCredential(API_KEY),
      {
        subtitleSource: SubtitleSource.OPENSUBTITLES,
        credentialKind: CredentialKind.ACCOUNT,
        credentialSecret: {
          username: ACCOUNT_USERNAME,
          password: ACCOUNT_PASSWORD,
        },
      },
      apiKeyCredential('short12'),
    ]);
    const sessionToken = await openSession(userConfig.id);

    const response = await callUserConfigApi({
      method: 'GET',
      url: `${USER_CONFIGS_URL}/${userConfig.id}`,
      sessionToken,
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    const {data} = readEnvelope(response);
    expect(data).toEqual({
      userConfigId: userConfig.id,
      manifestUrl: `http://localhost:80/${userConfig.id}/manifest.json`,
      languageCodes: ['tur'],
      subtitleLanguageLimit: userConfig.subtitleLanguageLimit,
      subtitleSourceSwitchStates: SWITCH_STATES,
      credentials: expect.any(Array),
    });
    const masked = (credential, maskedSecret) => ({
      credentialId: credential.id,
      subtitleSource: credential.subtitleSource,
      credentialKind: credential.credentialKind,
      maskedSecret,
      credentialStatus: CredentialStatus.UNCHECKED,
      credentialCheckedAt: null,
      quotaRemainingCount: null,
      quotaResetAt: null,
    });
    const [apiKey, account, shortKey] = userConfigCredentials;
    expect(data.credentials).toHaveLength(3);
    expect(data.credentials).toEqual(
      expect.arrayContaining([
        masked(apiKey, '••••1234'),
        masked(account, ACCOUNT_USERNAME),
        masked(shortKey, '••••'),
      ]),
    );
    for (const secret of [API_KEY, ACCOUNT_PASSWORD, 'short12', PASSWORD]) {
      expect(response.body).not.toContain(secret);
    }
    expect(response.body).not.toContain('passwordHash');
    expect(response.body).not.toContain('credentialSecret');
  });
});

describe('reading switch states', () => {
  it('reads a source missing from the stored switches as on', async () => {
    const {userConfig} = await createUserConfig({
      password: PASSWORD,
      subtitleSourceSwitchStates: {[SubtitleSource.THESUBTITLEDB]: false},
    });
    const sessionToken = await openSession(userConfig.id);

    const response = await callUserConfigApi({
      method: 'GET',
      url: `${USER_CONFIGS_URL}/${userConfig.id}`,
      sessionToken,
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(readEnvelope(response).data.subtitleSourceSwitchStates).toEqual({
      ...makeSwitchStatesOnly(SubtitleSource.values),
      [SubtitleSource.THESUBTITLEDB]: false,
    });
  });
});

describe('updating a configuration', () => {
  it('keeps a stored key when the patch sends it blank', async () => {
    const {userConfig, userConfigCredentials} = await seedUserConfig([
      apiKeyCredential(API_KEY),
    ]);
    const [credential] = userConfigCredentials;
    const sessionToken = await openSession(userConfig.id);

    const response = await patchCredentials({
      userConfigId: userConfig.id,
      sessionToken,
      credentials: [{credentialId: credential.id, ...apiKeyCredential('')}],
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(readEnvelope(response).data.credentials).toEqual([
      expect.objectContaining({
        credentialId: credential.id,
        maskedSecret: '••••1234',
      }),
    ]);
    const [stored] = await readStoredCredentials(userConfig.id);
    expect(stored.id).toBe(credential.id);
    expect(stored.credentialSecret).toBe(credential.credentialSecret);
    expect(checkThesubtitledbCredential).not.toHaveBeenCalled();
  });

  it('marks a rejected key invalid but still saves it', async () => {
    checkThesubtitledbCredential.mockResolvedValue({
      ...VALID_CHECK,
      credentialStatus: CredentialStatus.INVALID,
      quotaRemainingCount: null,
    });
    const {userConfig} = await seedUserConfig();
    const sessionToken = await openSession(userConfig.id);

    const response = await patchCredentials({
      userConfigId: userConfig.id,
      sessionToken,
      credentials: [apiKeyCredential('sdb_rejectedkey5678')],
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(readEnvelope(response).data.credentials).toEqual([
      expect.objectContaining({
        maskedSecret: '••••5678',
        credentialStatus: CredentialStatus.INVALID,
        credentialCheckedAt: expect.any(String),
      }),
    ]);
    const stored = await readStoredCredentials(userConfig.id);
    expect(stored.map(row => row.credentialStatus)).toEqual([
      CredentialStatus.INVALID,
    ]);
  });

  it('writes the quota a successful check reports', async () => {
    const {userConfig} = await seedUserConfig();
    const sessionToken = await openSession(userConfig.id);

    const response = await patchCredentials({
      userConfigId: userConfig.id,
      sessionToken,
      credentials: [apiKeyCredential(API_KEY)],
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(readEnvelope(response).data.credentials).toEqual([
      expect.objectContaining({
        credentialStatus: CredentialStatus.VALID,
        quotaRemainingCount: VALID_CHECK.quotaRemainingCount,
      }),
    ]);
  });

  it('leaves a key unchecked when its source cannot be reached', async () => {
    checkThesubtitledbCredential.mockRejectedValue(
      new SourceUnavailableError({
        subtitleSource: SubtitleSource.THESUBTITLEDB,
      }),
    );
    const {userConfig} = await seedUserConfig();
    const sessionToken = await openSession(userConfig.id);

    const response = await patchCredentials({
      userConfigId: userConfig.id,
      sessionToken,
      credentials: [apiKeyCredential(API_KEY)],
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    const stored = await readStoredCredentials(userConfig.id);
    expect(stored.map(row => row.credentialStatus)).toEqual([
      CredentialStatus.UNCHECKED,
    ]);
  });

  it('deletes a stored credential the patch leaves out', async () => {
    const {userConfig, userConfigCredentials} = await seedUserConfig([
      apiKeyCredential(API_KEY),
      apiKeyCredential('sdb_otherkey4321'),
    ]);
    const [kept] = userConfigCredentials;
    const sessionToken = await openSession(userConfig.id);

    const response = await patchCredentials({
      userConfigId: userConfig.id,
      sessionToken,
      credentials: [{credentialId: kept.id, ...apiKeyCredential('')}],
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    const stored = await readStoredCredentials(userConfig.id);
    expect(stored.map(row => row.id)).toEqual([kept.id]);
  });
});

describe('checking credentials on demand', () => {
  it('checks every stored credential', async () => {
    const {userConfig} = await seedUserConfig([
      apiKeyCredential(API_KEY),
      apiKeyCredential('sdb_otherkey4321'),
    ]);
    const sessionToken = await openSession(userConfig.id);

    const response = await callUserConfigApi({
      method: 'POST',
      url: `${USER_CONFIGS_URL}/${userConfig.id}/credential-checks`,
      sessionToken,
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(checkThesubtitledbCredential).toHaveBeenCalledTimes(2);
    expect(
      readEnvelope(response).data.credentials.map(
        credential => credential.credentialStatus,
      ),
    ).toEqual([CredentialStatus.VALID, CredentialStatus.VALID]);
  });
});

describe('changing the password', () => {
  it('opens sessions with the new password only', async () => {
    const {userConfig} = await seedUserConfig();
    const sessionToken = await openSession(userConfig.id);

    const response = await callUserConfigApi({
      method: 'PUT',
      url: `${USER_CONFIGS_URL}/${userConfig.id}/password`,
      payload: {currentPassword: PASSWORD, newPassword: 'battery staple'},
      sessionToken,
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(readEnvelope(response).message).toBe('Password changed.');
    expect((await login(userConfig.id, PASSWORD)).statusCode).toBe(
      StatusCodes.UNAUTHORIZED,
    );
    expect((await login(userConfig.id, 'battery staple')).statusCode).toBe(
      StatusCodes.OK,
    );
  });
});

describe('deleting a configuration', () => {
  it('deletes idempotently', async () => {
    const {userConfig} = await seedUserConfig([apiKeyCredential(API_KEY)]);
    const sessionToken = await openSession(userConfig.id);
    const remove = () =>
      callUserConfigApi({
        method: 'DELETE',
        url: `${USER_CONFIGS_URL}/${userConfig.id}`,
        payload: {password: PASSWORD},
        sessionToken,
      });

    const first = await remove();
    const second = await remove();

    expect([first.statusCode, second.statusCode]).toEqual([
      StatusCodes.OK,
      StatusCodes.OK,
    ]);
    expect(readEnvelope(first).message).toBe('Configuration deleted.');
    expect(readEnvelope(second).message).toBe('Configuration deleted.');
    expect(
      await UserConfig.findByPk(userConfig.id, {attributes: ['id']}),
    ).toBeNull();
    expect(await readStoredCredentials(userConfig.id)).toEqual([]);
    const relogin = await login(userConfig.id, PASSWORD);
    expect(relogin.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    expect(readEnvelope(relogin).message).toBe(LOGIN_REFUSAL);
  });
});

describe('refusing changes', () => {
  it('refuses a delete with a wrong password and keeps the configuration', async () => {
    const {userConfig} = await seedUserConfig();
    const sessionToken = await openSession(userConfig.id);

    const response = await callUserConfigApi({
      method: 'DELETE',
      url: `${USER_CONFIGS_URL}/${userConfig.id}`,
      payload: {password: WRONG_PASSWORD},
      sessionToken,
    });

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    expect(readEnvelope(response).message).toBe(LOGIN_REFUSAL);
    expect(
      await UserConfig.findByPk(userConfig.id, {attributes: ['id']}),
    ).not.toBeNull();
  });

  it('answers every session route on a configuration that is gone with the login refusal', async () => {
    const {userConfig} = await seedUserConfig();
    const sessionToken = await openSession(userConfig.id);
    await UserConfig.destroy({where: {id: userConfig.id}});
    const url = `${USER_CONFIGS_URL}/${userConfig.id}`;

    const responses = await Promise.all([
      callUserConfigApi({method: 'GET', url, sessionToken}),
      callUserConfigApi({
        method: 'PATCH',
        url,
        payload: {languageCodes: ['eng']},
        sessionToken,
      }),
      callUserConfigApi({
        method: 'PUT',
        url: `${url}/password`,
        payload: {currentPassword: PASSWORD, newPassword: 'battery staple'},
        sessionToken,
      }),
      callUserConfigApi({
        method: 'POST',
        url: `${url}/credential-checks`,
        sessionToken,
      }),
    ]);

    expect(
      responses.map(response => [
        response.statusCode,
        readEnvelope(response).message,
      ]),
    ).toEqual(Array(4).fill([StatusCodes.UNAUTHORIZED, LOGIN_REFUSAL]));
  });

  it('refuses a foreign credential id and changes nothing', async () => {
    const [own, foreign] = await Promise.all([
      seedUserConfig([
        apiKeyCredential(API_KEY),
        apiKeyCredential('sdb_otherkey4321'),
      ]),
      seedUserConfig([apiKeyCredential('sdb_foreignkey9999')]),
    ]);
    const [kept] = own.userConfigCredentials;
    const [foreignCredential] = foreign.userConfigCredentials;
    const readSeals = async () =>
      sortBy(
        (await readStoredCredentials(own.userConfig.id)).map(
          ({id, credentialSecret}) => ({id, credentialSecret}),
        ),
        ['id'],
      );
    const before = await readSeals();
    const sessionToken = await openSession(own.userConfig.id);

    const response = await patchCredentials({
      userConfigId: own.userConfig.id,
      sessionToken,
      credentials: [
        {credentialId: kept.id, ...apiKeyCredential('')},
        {credentialId: foreignCredential.id, ...apiKeyCredential('')},
      ],
    });

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);
    expect(readEnvelope(response).message).toBe('Credential not found.');
    expect(await readSeals()).toEqual(before);
  });

  it('follows the list order and re-checks only a changed key', async () => {
    checkThesubtitledbCredential.mockRejectedValue(
      new SourceUnavailableError({
        subtitleSource: SubtitleSource.THESUBTITLEDB,
      }),
    );
    const {userConfig, userConfigCredentials} = await seedUserConfig([
      apiKeyCredential(API_KEY),
      apiKeyCredential('sdb_otherkey4321'),
    ]);
    const [first, second] = userConfigCredentials;
    await UserConfigCredential.update(
      {credentialStatus: CredentialStatus.VALID},
      {where: {userConfigId: userConfig.id}},
    );
    const sessionToken = await openSession(userConfig.id);

    const response = await patchCredentials({
      userConfigId: userConfig.id,
      sessionToken,
      credentials: [
        {credentialId: second.id, ...apiKeyCredential('')},
        {credentialId: first.id, ...apiKeyCredential('sdb_changedkey2468')},
      ],
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    const stored = await UserConfigCredential.findAll({
      attributes: ['id', 'credentialPosition', 'credentialStatus'],
      where: {userConfigId: userConfig.id},
    });
    expect(
      sortBy(
        stored.map(({id, credentialPosition, credentialStatus}) => ({
          id,
          credentialPosition,
          credentialStatus,
        })),
        ['credentialPosition'],
      ),
    ).toEqual([
      {
        id: second.id,
        credentialPosition: 0,
        credentialStatus: CredentialStatus.VALID,
      },
      {
        id: first.id,
        credentialPosition: 1,
        credentialStatus: CredentialStatus.UNCHECKED,
      },
    ]);
    expect(checkThesubtitledbCredential).toHaveBeenCalledTimes(1);
    expect(checkThesubtitledbCredential).toHaveBeenCalledWith(
      expect.objectContaining({apiKey: 'sdb_changedkey2468'}),
      expect.anything(),
    );
  });

  it('refuses a host that makes no manifest url and stores nothing', async () => {
    const app = await getTestApp();

    const response = await app.inject({
      method: 'POST',
      url: getTestAppBasePath() + USER_CONFIGS_URL,
      headers: {host: 'user@evil.test'},
      payload: {
        password: PASSWORD,
        languageCodes: ['tur'],
        subtitleSourceSwitchStates: SWITCH_STATES,
        credentials: [],
      },
    });

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(await UserConfig.count()).toBe(0);
  });
});

describe('the sources list', () => {
  it('lists the registered sources', async () => {
    const response = await callUserConfigApi({
      method: 'GET',
      url: '/api/subtitle-sources',
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(readEnvelope(response).data).toContainEqual({
      subtitleSource: SubtitleSource.THESUBTITLEDB,
      label: 'TheSubtitleDB',
      credentialRequirement: CredentialRequirement.OPTIONAL,
      credentialKinds: [CredentialKind.API_KEY],
      credentialLimit: 10,
    });
  });

  it("reports Community Subtitles as needing the user's own token", async () => {
    const response = await callUserConfigApi({
      method: 'GET',
      url: '/api/subtitle-sources',
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(readEnvelope(response).data).toContainEqual({
      subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
      label: 'Community Subtitles',
      credentialRequirement: CredentialRequirement.REQUIRED,
      credentialKinds: [CredentialKind.ACCESS_TOKEN],
      credentialLimit: 1,
    });
  });
});
