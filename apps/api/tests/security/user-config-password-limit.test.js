import {describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {config} from '../../src/config/index.js';
import {UserConfig} from '../../src/db/models/user-config.js';
import {redis} from '../../src/redis/index.js';
import {readEnvelope} from '../helpers/assertions.js';
import {createUserConfig} from '../helpers/factories.js';
import {
  USER_CONFIGS_URL,
  callUserConfigApi,
  login,
} from '../helpers/user-config-api.js';

const PASSWORD = 'correct horse';
const WRONG_PASSWORD = 'wrong horse';
const LOGIN_REFUSAL = 'Wrong configuration ID or password.';
const ATTEMPT_MAX = config.rateLimitUserConfigPasswordUserConfigMax;

async function attempt(userConfigId, password, times) {
  const statusCodes = [];
  for (let index = 0; index < times; index += 1) {
    statusCodes.push((await login(userConfigId, password)).statusCode);
  }
  return statusCodes;
}

const seed = async () =>
  (await createUserConfig({password: PASSWORD})).userConfig;

describe('password attempts on a configuration', () => {
  it('spends a password attempt only when it fails', async () => {
    const userConfig = await seed();

    const failures = await attempt(userConfig.id, WRONG_PASSWORD, ATTEMPT_MAX);
    const sixth = await login(userConfig.id, WRONG_PASSWORD);

    expect(failures).toEqual(Array(ATTEMPT_MAX).fill(StatusCodes.UNAUTHORIZED));
    expect(sixth.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS);
    expect(readEnvelope(sixth).message).toBe(LOGIN_REFUSAL);
  });

  it('forgives the failures before a right password', async () => {
    const userConfig = await seed();

    const before = await attempt(
      userConfig.id,
      WRONG_PASSWORD,
      ATTEMPT_MAX - 1,
    );
    const right = await login(userConfig.id, PASSWORD);
    const after = await attempt(userConfig.id, WRONG_PASSWORD, ATTEMPT_MAX);

    expect(before).toEqual(
      Array(ATTEMPT_MAX - 1).fill(StatusCodes.UNAUTHORIZED),
    );
    expect(right.statusCode).toBe(StatusCodes.OK);
    expect(after).toEqual(Array(ATTEMPT_MAX).fill(StatusCodes.UNAUTHORIZED));
  });

  it('counts attempts per configuration', async () => {
    const [locked, other] = await Promise.all([seed(), seed()]);

    await attempt(locked.id, WRONG_PASSWORD, ATTEMPT_MAX);
    const response = await login(other.id, PASSWORD);

    expect(response.statusCode).toBe(StatusCodes.OK);
  });

  it('spends an attempt on a wrong current password and keeps the hash', async () => {
    const userConfig = await seed();
    const sessionToken = readEnvelope(await login(userConfig.id, PASSWORD)).data
      .sessionToken;
    const changePassword = () =>
      callUserConfigApi({
        method: 'PUT',
        url: `${USER_CONFIGS_URL}/${userConfig.id}/password`,
        payload: {currentPassword: WRONG_PASSWORD, newPassword: 'new horse'},
        sessionToken,
      });

    const failures = [];
    for (let index = 0; index < ATTEMPT_MAX; index += 1) {
      failures.push(await changePassword());
    }
    const sixth = await changePassword();

    expect(
      failures.map(response => [
        response.statusCode,
        readEnvelope(response).message,
      ]),
    ).toEqual(
      Array(ATTEMPT_MAX).fill([StatusCodes.UNAUTHORIZED, LOGIN_REFUSAL]),
    );
    expect(sixth.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS);
    const stored = await UserConfig.findByPk(userConfig.id, {
      attributes: ['passwordHash'],
    });
    expect(stored.passwordHash).toBe(userConfig.passwordHash);
  });

  it('counts an upper-case id against the same configuration', async () => {
    const userConfig = await seed();

    await attempt(userConfig.id, WRONG_PASSWORD, ATTEMPT_MAX - 1);
    const upper = await attempt(userConfig.id.toUpperCase(), WRONG_PASSWORD, 2);

    expect(upper).toEqual([
      StatusCodes.UNAUTHORIZED,
      StatusCodes.TOO_MANY_REQUESTS,
    ]);
  });

  it('keys the attempts by configuration in a user-config bucket', async () => {
    const userConfig = await seed();

    await login(userConfig.id, WRONG_PASSWORD);

    expect(
      await redis.keys('rate:user-config:*:user-config-password-*'),
    ).toEqual([
      `rate:user-config:${ATTEMPT_MAX}/${config.rateLimitUserConfigPasswordWindow}:user-config-password-${userConfig.id}`,
    ]);
  });
});
