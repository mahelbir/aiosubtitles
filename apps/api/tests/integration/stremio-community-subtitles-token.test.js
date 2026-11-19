import {beforeEach, describe, expect, it, vi} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {ErrorCode} from '@repo/shared/constants/error-code.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {UserConfigCredential} from '../../src/db/models/user-config-credential.js';
import {openCredentialSecret} from '../../src/lib/credential-secret.js';
import {createSubtitleSourceRegistry} from '../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {setTestAppOptions} from '../helpers/app.js';
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
const COMMUNITY_TOKEN = 'scs-fixture_token-0001-abcdEFGH';
const STORED_COMMUNITY_TOKEN = 'scs-stored_token-0002-ijklMNOP';
const ANISUB_TOKEN = '7|anisub token';
const COMMUNITY = SubtitleSource.STREMIO_COMMUNITY_SUBTITLES;
const INSTALL_LINK = `https://stremio-community-subtitles.top/${COMMUNITY_TOKEN}/manifest.json`;
const STREMIO_LINK = `stremio://stremio-community-subtitles.top/${COMMUNITY_TOKEN}/manifest.json`;
const TOKEN_FIELD = 'credentials.0.credentialSecret.accessToken';

const VALID_CHECK = {
  credentialStatus: CredentialStatus.VALID,
  quotaRemainingCount: null,
  quotaAllowedCount: null,
  quotaResetAt: null,
};

const checkCommunityCredential = vi.fn();
const checkAnisubCredential = vi.fn();

setTestAppOptions({
  subtitleSourceRegistry: createSubtitleSourceRegistry([
    createFixtureSubtitleSourceClient({
      subtitleSource: COMMUNITY,
      credentialKinds: [CredentialKind.ACCESS_TOKEN],
      canSearchWithoutCredential: vi.fn(() => false),
      canDownloadWithoutCredential: vi.fn(() => false),
      checkCredential: checkCommunityCredential,
    }),
    createFixtureSubtitleSourceClient({
      subtitleSource: SubtitleSource.ANISUB,
      credentialKinds: [CredentialKind.ACCESS_TOKEN],
      checkCredential: checkAnisubCredential,
    }),
  ]),
});

const SWITCH_STATES = makeSwitchStatesOnly([COMMUNITY, SubtitleSource.ANISUB]);

beforeEach(() => {
  for (const check of [checkCommunityCredential, checkAnisubCredential]) {
    check.mockReset();
    check.mockResolvedValue(VALID_CHECK);
  }
});

function tokenCredential(accessToken, subtitleSource = COMMUNITY) {
  return {
    subtitleSource,
    credentialKind: CredentialKind.ACCESS_TOKEN,
    credentialSecret: {accessToken},
  };
}

function createConfig(credentials) {
  return callUserConfigApi({
    method: 'POST',
    url: USER_CONFIGS_URL,
    payload: {
      password: PASSWORD,
      languageCodes: ['eng'],
      subtitleSourceSwitchStates: SWITCH_STATES,
      credentials,
    },
  });
}

async function seedConfig(credentials = []) {
  const seeded = await createUserConfig({
    password: PASSWORD,
    languageCodes: ['eng'],
    subtitleSourceSwitchStates: SWITCH_STATES,
    credentials,
  });
  const response = await login(seeded.userConfig.id, PASSWORD);
  expect(response.statusCode).toBe(StatusCodes.OK);
  return {...seeded, sessionToken: readEnvelope(response).data.sessionToken};
}

function patchCredentials({userConfigId, sessionToken, credentials}) {
  return callUserConfigApi({
    method: 'PATCH',
    url: `${USER_CONFIGS_URL}/${userConfigId}`,
    payload: {credentials},
    sessionToken,
  });
}

function readConfig({userConfigId, sessionToken}) {
  return callUserConfigApi({
    method: 'GET',
    url: `${USER_CONFIGS_URL}/${userConfigId}`,
    sessionToken,
  });
}

async function readOpenedSecrets(userConfigId) {
  const storedCredentials = await UserConfigCredential.findAll({
    attributes: ['subtitleSource', 'credentialSecret'],
    where: {userConfigId},
  });
  return storedCredentials.map(({subtitleSource, credentialSecret}) =>
    openCredentialSecret({
      userConfigId,
      subtitleSource,
      sealedSecret: credentialSecret,
    }),
  );
}

async function expectStoredToken({userConfigId, sessionToken}, accessToken) {
  expect(await readOpenedSecrets(userConfigId)).toEqual([{accessToken}]);
  const read = await readConfig({userConfigId, sessionToken});
  expect(read.statusCode).toBe(StatusCodes.OK);
  expect(readEnvelope(read).data.credentials).toEqual([
    expect.objectContaining({
      subtitleSource: COMMUNITY,
      credentialSecret: {accessToken},
    }),
  ]);
}

describe('saving a Community Subtitles token', () => {
  it('keeps only the token from a pasted install link on create', async () => {
    const response = await createConfig([tokenCredential(INSTALL_LINK)]);

    expect(response.statusCode).toBe(StatusCodes.CREATED);
    const {userConfigId, sessionToken} = readEnvelope(response).data;
    await expectStoredToken({userConfigId, sessionToken}, COMMUNITY_TOKEN);
    expect(checkCommunityCredential).toHaveBeenCalledWith(
      expect.objectContaining({accessToken: COMMUNITY_TOKEN}),
      expect.anything(),
    );
  });

  it('keeps a bare token as entered on create', async () => {
    const response = await createConfig([tokenCredential(COMMUNITY_TOKEN)]);

    expect(response.statusCode).toBe(StatusCodes.CREATED);
    const {userConfigId, sessionToken} = readEnvelope(response).data;
    await expectStoredToken({userConfigId, sessionToken}, COMMUNITY_TOKEN);
  });

  it('keeps only the token from a stremio link added by a patch', async () => {
    const {userConfig, sessionToken} = await seedConfig();

    const response = await patchCredentials({
      userConfigId: userConfig.id,
      sessionToken,
      credentials: [tokenCredential(STREMIO_LINK)],
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    await expectStoredToken(
      {userConfigId: userConfig.id, sessionToken},
      COMMUNITY_TOKEN,
    );
    expect(checkCommunityCredential).toHaveBeenCalledWith(
      expect.objectContaining({accessToken: COMMUNITY_TOKEN}),
      expect.anything(),
    );
  });

  it('keeps only the token from a link that replaces a stored token', async () => {
    const {userConfig, userConfigCredentials, sessionToken} = await seedConfig([
      tokenCredential(STORED_COMMUNITY_TOKEN),
    ]);
    const [stored] = userConfigCredentials;

    const response = await patchCredentials({
      userConfigId: userConfig.id,
      sessionToken,
      credentials: [
        {credentialId: stored.id, ...tokenCredential(INSTALL_LINK)},
      ],
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    await expectStoredToken(
      {userConfigId: userConfig.id, sessionToken},
      COMMUNITY_TOKEN,
    );
    expect(checkCommunityCredential).toHaveBeenCalledWith(
      expect.objectContaining({accessToken: COMMUNITY_TOKEN}),
      expect.anything(),
    );
  });

  it('keeps the stored token when a patch sends it blank', async () => {
    const {userConfig, userConfigCredentials, sessionToken} = await seedConfig([
      tokenCredential(STORED_COMMUNITY_TOKEN),
    ]);
    const [stored] = userConfigCredentials;

    const response = await patchCredentials({
      userConfigId: userConfig.id,
      sessionToken,
      credentials: [{credentialId: stored.id, ...tokenCredential('')}],
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    await expectStoredToken(
      {userConfigId: userConfig.id, sessionToken},
      STORED_COMMUNITY_TOKEN,
    );
    expect(checkCommunityCredential).not.toHaveBeenCalled();
  });

  it('flags the token field for a value that holds no token and stores nothing', async () => {
    const response = await createConfig([
      tokenCredential('https://stremio-community-subtitles.top/configure'),
    ]);

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    const {data} = readEnvelope(response);
    expect(data.errorCode).toBe(ErrorCode.VALIDATION_ERROR);
    expect(data.errors.map(({field}) => field)).toEqual([TOKEN_FIELD]);
    expect(await UserConfigCredential.count()).toBe(0);
    expect(checkCommunityCredential).not.toHaveBeenCalled();
  });

  it('leaves an AniSub token as entered', async () => {
    const response = await createConfig([
      tokenCredential(ANISUB_TOKEN, SubtitleSource.ANISUB),
    ]);

    expect(response.statusCode).toBe(StatusCodes.CREATED);
    const {userConfigId} = readEnvelope(response).data;
    expect(await readOpenedSecrets(userConfigId)).toEqual([
      {accessToken: ANISUB_TOKEN},
    ]);
  });
});
