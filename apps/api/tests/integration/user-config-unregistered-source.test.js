import {describe, expect, it, vi} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {UserConfigCredential} from '../../src/db/models/user-config-credential.js';
import {UserConfig} from '../../src/db/models/user-config.js';
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
const UNAVAILABLE = 'This source is not available yet.';

const checkCredential = vi.fn();

setTestAppOptions({
  subtitleSourceRegistry: createSubtitleSourceRegistry([
    createFixtureSubtitleSourceClient({
      subtitleSource: SubtitleSource.THESUBTITLEDB,
      credentialKinds: [CredentialKind.API_KEY],
      checkCredential,
    }),
  ]),
});

const SWITCH_STATES = makeSwitchStatesOnly([SubtitleSource.THESUBTITLEDB]);

const SUBDL_CREDENTIAL = {
  subtitleSource: SubtitleSource.SUBDL,
  credentialKind: CredentialKind.API_KEY,
  credentialSecret: {apiKey: 'subdl_fixturekey1234'},
};

describe('a credential for a source with no client', () => {
  it('refuses a credential for a source with no client', async () => {
    const response = await callUserConfigApi({
      method: 'POST',
      url: USER_CONFIGS_URL,
      payload: {
        password: PASSWORD,
        languageCodes: ['tur'],
        subtitleSourceSwitchStates: SWITCH_STATES,
        credentials: [SUBDL_CREDENTIAL],
      },
    });

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(readEnvelope(response).message).toBe(UNAVAILABLE);
    expect(await UserConfig.count()).toBe(0);
    expect(checkCredential).not.toHaveBeenCalled();
  });

  it('refuses it on an update and keeps the stored list', async () => {
    const {userConfig} = await createUserConfig({
      password: PASSWORD,
      subtitleSourceSwitchStates: SWITCH_STATES,
    });
    const session = await login(userConfig.id, PASSWORD);
    expect(session.statusCode).toBe(StatusCodes.OK);

    const response = await callUserConfigApi({
      method: 'PATCH',
      url: `${USER_CONFIGS_URL}/${userConfig.id}`,
      payload: {credentials: [SUBDL_CREDENTIAL]},
      sessionToken: readEnvelope(session).data.sessionToken,
    });

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(readEnvelope(response).message).toBe(UNAVAILABLE);
    expect(
      await UserConfigCredential.count({where: {userConfigId: userConfig.id}}),
    ).toBe(0);
  });
});
