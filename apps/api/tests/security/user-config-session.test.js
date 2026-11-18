import {describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {fingerprintPasswordHash} from '../../src/lib/crypto.js';
import {generateJwt} from '../../src/lib/jwt.js';
import {USER_CONFIG_SESSION_TYPE} from '../../src/plugins/user-config-session.js';
import {readEnvelope} from '../helpers/assertions.js';
import {
  DEFAULT_USER_CONFIG_PASSWORD,
  createUserConfig,
} from '../helpers/factories.js';
import {
  USER_CONFIGS_URL,
  callUserConfigApi,
  login,
} from '../helpers/user-config-api.js';

const SESSION_REFUSAL = 'Your session expired. Enter your password again.';
const USER_CONFIG_API_WINDOW_MAX = 30;
const NEW_PASSWORD = 'battery staple';

const seed = async () => (await createUserConfig()).userConfig;

function readUserConfig(userConfigId, sessionToken) {
  return callUserConfigApi({
    method: 'GET',
    url: `${USER_CONFIGS_URL}/${userConfigId}`,
    sessionToken,
  });
}

function callGuardedRoutes(userConfigId, sessionToken) {
  const url = `${USER_CONFIGS_URL}/${userConfigId}`;
  return Promise.all([
    readUserConfig(userConfigId, sessionToken),
    callUserConfigApi({
      method: 'PATCH',
      url,
      payload: {languageCodes: ['eng']},
      sessionToken,
    }),
    callUserConfigApi({
      method: 'POST',
      url: `${url}/credential-checks`,
      sessionToken,
    }),
  ]);
}

function mintSession(
  userConfig,
  {type = USER_CONFIG_SESSION_TYPE, seconds = 60, ...claims} = {},
) {
  return generateJwt(
    {type, seconds},
    {
      sub: userConfig.id,
      passwordFingerprint: fingerprintPasswordHash(userConfig.passwordHash),
      ...claims,
    },
  );
}

async function openSession(userConfigId, password) {
  const response = await login(userConfigId, password);
  expect(response.statusCode).toBe(StatusCodes.OK);
  return readEnvelope(response).data.sessionToken;
}

function changePassword(userConfigId, sessionToken) {
  return callUserConfigApi({
    method: 'PUT',
    url: `${USER_CONFIGS_URL}/${userConfigId}/password`,
    payload: {
      currentPassword: DEFAULT_USER_CONFIG_PASSWORD,
      newPassword: NEW_PASSWORD,
    },
    sessionToken,
  });
}

const toRefusals = responses =>
  responses.map(response => [
    response.statusCode,
    readEnvelope(response).message,
  ]);

describe('a session token', () => {
  it('accepts a token carrying the current password fingerprint', async () => {
    const userConfig = await seed();

    const response = await readUserConfig(
      userConfig.id,
      await mintSession(userConfig),
    );

    expect(response.statusCode).toBe(StatusCodes.OK);
  });

  it('refuses an expired token', async () => {
    const userConfig = await seed();
    const sessionToken = await mintSession(userConfig, {seconds: 0});

    const response = await readUserConfig(userConfig.id, sessionToken);

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    expect(readEnvelope(response).message).toBe(SESSION_REFUSAL);
  });

  it('refuses a token of another type naming the configuration', async () => {
    const userConfig = await seed();
    const sessionToken = await mintSession(userConfig, {
      type: 'another-session',
    });

    const response = await readUserConfig(userConfig.id, sessionToken);

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    expect(readEnvelope(response).message).toBe(SESSION_REFUSAL);
  });

  it('refuses a token without a password fingerprint', async () => {
    const userConfig = await seed();
    const sessionToken = await generateJwt(
      {type: USER_CONFIG_SESSION_TYPE, seconds: 60},
      {sub: userConfig.id},
    );

    const response = await readUserConfig(userConfig.id, sessionToken);

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    expect(readEnvelope(response).message).toBe(SESSION_REFUSAL);
  });

  it('refuses a token with a tampered password fingerprint', async () => {
    const userConfig = await seed();
    const sessionTokens = await Promise.all(
      ['tampered-fingerprint', 42, null].map(passwordFingerprint =>
        mintSession(userConfig, {passwordFingerprint}),
      ),
    );

    const responses = await Promise.all(
      sessionTokens.map(sessionToken =>
        readUserConfig(userConfig.id, sessionToken),
      ),
    );

    expect(toRefusals(responses)).toEqual(
      Array(3).fill([StatusCodes.UNAUTHORIZED, SESSION_REFUSAL]),
    );
  });

  it('ends every session issued before a password change', async () => {
    const userConfig = await seed();
    const [earlier, current] = await Promise.all([
      openSession(userConfig.id, DEFAULT_USER_CONFIG_PASSWORD),
      openSession(userConfig.id, DEFAULT_USER_CONFIG_PASSWORD),
    ]);

    expect((await changePassword(userConfig.id, current)).statusCode).toBe(
      StatusCodes.OK,
    );

    for (const sessionToken of [earlier, current]) {
      const responses = await Promise.all([
        callGuardedRoutes(userConfig.id, sessionToken),
        callUserConfigApi({
          method: 'DELETE',
          url: `${USER_CONFIGS_URL}/${userConfig.id}`,
          payload: {password: NEW_PASSWORD},
          sessionToken,
        }),
        callUserConfigApi({
          method: 'PUT',
          url: `${USER_CONFIGS_URL}/${userConfig.id}/password`,
          payload: {
            currentPassword: NEW_PASSWORD,
            newPassword: DEFAULT_USER_CONFIG_PASSWORD,
          },
          sessionToken,
        }),
      ]);
      expect(toRefusals(responses.flat())).toEqual(
        Array(5).fill([StatusCodes.UNAUTHORIZED, SESSION_REFUSAL]),
      );
    }
  });

  it('keeps the caller signed in through the token the password change returns', async () => {
    const userConfig = await seed();
    const earlier = await openSession(
      userConfig.id,
      DEFAULT_USER_CONFIG_PASSWORD,
    );

    const response = await changePassword(userConfig.id, earlier);

    expect(response.statusCode).toBe(StatusCodes.OK);
    const {sessionToken} = readEnvelope(response).data;
    const [read, update] = await callGuardedRoutes(userConfig.id, sessionToken);
    expect([read.statusCode, update.statusCode]).toEqual([
      StatusCodes.OK,
      StatusCodes.OK,
    ]);
    expect(toRefusals([await readUserConfig(userConfig.id, earlier)])).toEqual([
      [StatusCodes.UNAUTHORIZED, SESSION_REFUSAL],
    ]);
  });

  it('accepts a session opened after a password change', async () => {
    const userConfig = await seed();
    await changePassword(
      userConfig.id,
      await openSession(userConfig.id, DEFAULT_USER_CONFIG_PASSWORD),
    );

    const responses = await callGuardedRoutes(
      userConfig.id,
      await openSession(userConfig.id, NEW_PASSWORD),
    );

    expect(responses.map(response => response.statusCode)).toEqual(
      Array(3).fill(StatusCodes.OK),
    );
  });

  it('counts a request without a session against the route window', async () => {
    const userConfig = await seed();

    const statusCodes = [];
    for (let index = 0; index <= USER_CONFIG_API_WINDOW_MAX; index += 1) {
      statusCodes.push((await readUserConfig(userConfig.id)).statusCode);
    }

    expect(statusCodes).toEqual([
      ...Array(USER_CONFIG_API_WINDOW_MAX).fill(StatusCodes.UNAUTHORIZED),
      StatusCodes.TOO_MANY_REQUESTS,
    ]);
  });
});
