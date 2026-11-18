import {describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {generateJwt} from '../../src/lib/jwt.js';
import {USER_CONFIG_SESSION_TYPE} from '../../src/plugins/user-config-session.js';
import {readEnvelope} from '../helpers/assertions.js';
import {createUserConfig} from '../helpers/factories.js';
import {
  USER_CONFIGS_URL,
  callUserConfigApi,
} from '../helpers/user-config-api.js';

const SESSION_REFUSAL = 'Your session expired. Enter your password again.';
const USER_CONFIG_API_WINDOW_MAX = 30;

const seed = async () => (await createUserConfig()).userConfig;

function readUserConfig(userConfigId, sessionToken) {
  return callUserConfigApi({
    method: 'GET',
    url: `${USER_CONFIGS_URL}/${userConfigId}`,
    sessionToken,
  });
}

describe('a session token', () => {
  it('refuses an expired token', async () => {
    const userConfig = await seed();
    const sessionToken = await generateJwt(
      {type: USER_CONFIG_SESSION_TYPE, seconds: 0},
      {sub: userConfig.id},
    );

    const response = await readUserConfig(userConfig.id, sessionToken);

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    expect(readEnvelope(response).message).toBe(SESSION_REFUSAL);
  });

  it('refuses a token of another type naming the configuration', async () => {
    const userConfig = await seed();
    const sessionToken = await generateJwt(
      {type: 'another-session', seconds: 60},
      {sub: userConfig.id},
    );

    const response = await readUserConfig(userConfig.id, sessionToken);

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    expect(readEnvelope(response).message).toBe(SESSION_REFUSAL);
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
