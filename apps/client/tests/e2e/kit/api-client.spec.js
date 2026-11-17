import {StatusCodes} from 'http-status-codes';
import {Permission} from '@repo/shared/constants/permission.js';
import {
  FIXTURE_RECORD_PATH,
  REFRESH_PATH,
  getApiFailure,
  getApiUrl,
  getErrorEnvelope,
  getFailedRequestPattern,
  getPrincipal,
  getRefreshFailurePattern,
  getSuccessEnvelope,
  getTransientFailures,
  respondInSequence,
  stubApi,
} from '../lib/api.js';
import {expectFixtureState, openFixture} from '../lib/fixture-page.js';
import {clickButton} from '../lib/page.js';
import {readPersistedSession} from '../lib/session.js';
import {expect, test} from '../lib/test.js';

const RECORD_URL = getApiUrl(FIXTURE_RECORD_PATH);
const REFRESH_URL = getApiUrl(REFRESH_PATH);
const FIXTURE_URL = /\/admin\/fixtures\/api-client$/;
const RECORD = {id: 7, name: 'Ada Yılmaz'};
const RECORD_MESSAGE = 'Kayıt getirildi.';
const PRINCIPAL = getPrincipal([Permission.ADMIN]);
const FIRST_TOKEN = 'Bearer access-1';
const REFRESHED_TOKEN = 'Bearer access-refreshed';
const FIRST_SESSION = {accessToken: 'access-1', refreshToken: 'refresh-1'};
const REFRESHED_SESSION = {...FIRST_SESSION, accessToken: 'access-refreshed'};
const KEPT_SESSION = {...FIRST_SESSION, sessionExpired: false};
const EXPIRED_SESSION = {
  accessToken: null,
  refreshToken: null,
  principal: null,
  sessionExpired: true,
};
const REFRESH_UNAVAILABLE = 'Oturum servisi geçici olarak kullanılamıyor.';
const UNAVAILABLE_REFRESH_FAILURE = getApiFailure(
  StatusCodes.SERVICE_UNAVAILABLE,
  REFRESH_UNAVAILABLE,
);

const recordResponse = () => ({
  json: getSuccessEnvelope(RECORD, RECORD_MESSAGE),
});

const refreshResponse = () => ({
  json: getSuccessEnvelope({
    accessToken: REFRESHED_SESSION.accessToken,
    expiresIn: 3600,
  }),
});

const unavailableRefreshResponse = () => UNAVAILABLE_REFRESH_FAILURE.response;

const unauthorizedResponse = message => () => ({
  status: StatusCodes.UNAUTHORIZED,
  json: getErrorEnvelope(message),
});

async function signIn(page) {
  await clickButton(page, 'Oturum aç');
  await expectFixtureState(page).toMatchObject({session: FIRST_SESSION});
}

function stubRecordForRefreshedToken(page) {
  return stubApi(page, RECORD_URL, ({authorization}) =>
    authorization === FIRST_TOKEN
      ? unauthorizedResponse('Oturum süresi doldu.')()
      : recordResponse(),
  );
}

async function signInExpiringIn(page, expiresIn, respondToRefresh) {
  await openFixture(page, 'api-client', {expiresIn});
  const hits = await Promise.all([
    stubApi(page, RECORD_URL, recordResponse),
    stubApi(page, REFRESH_URL, respondToRefresh),
  ]);
  await signIn(page);
  return hits;
}

function getAuthorizations(hits) {
  return hits.map(hit => hit.authorization);
}

function getBodies(hits) {
  return hits.map(hit => hit.body);
}

test.describe('api client', () => {
  test.beforeEach(async ({page}) => {
    await openFixture(page, 'api-client');
  });

  test('apiData resolves the envelope payload and apiEnvelope the whole envelope, both under the bearer token', async ({
    page,
  }) => {
    const recordHits = await stubApi(page, RECORD_URL, recordResponse);
    const refreshHits = await stubApi(page, REFRESH_URL, refreshResponse);
    await signIn(page);

    await clickButton(page, 'Kaydı getir');
    await clickButton(page, 'Zarfı getir');

    await expectFixtureState(page).toMatchObject({
      requests: {
        record: {status: 'fulfilled', value: RECORD},
        envelope: {
          status: 'fulfilled',
          value: getSuccessEnvelope(RECORD, RECORD_MESSAGE),
        },
      },
    });
    expect(getAuthorizations(recordHits)).toEqual([FIRST_TOKEN, FIRST_TOKEN]);
    expect(refreshHits).toEqual([]);
  });

  test('a token inside the expiry margin is refreshed before the request goes out', async ({
    page,
  }) => {
    const [recordHits, refreshHits] = await signInExpiringIn(
      page,
      10,
      refreshResponse,
    );

    await clickButton(page, 'Kaydı getir');

    await expectFixtureState(page).toMatchObject({
      requests: {record: {status: 'fulfilled', value: RECORD}},
      session: REFRESHED_SESSION,
    });
    expect(getBodies(refreshHits)).toEqual([{refreshToken: 'refresh-1'}]);
    expect(getAuthorizations(recordHits)).toEqual([REFRESHED_TOKEN]);
  });

  test('query values: arrays repeat, null and empty strings are dropped, dates become ISO strings', async ({
    page,
  }) => {
    const hits = await stubApi(
      page,
      url => url.href.startsWith(getApiUrl('/fixtures/records?')),
      () => ({json: getSuccessEnvelope([])}),
    );

    await clickButton(page, 'Kayıtları ara');

    await expectFixtureState(page).toMatchObject({
      requests: {search: {status: 'fulfilled', value: []}},
    });
    const {searchParams} = hits[0].url;
    expect([...searchParams.keys()]).toEqual([
      'days',
      'days',
      'ids',
      'ids',
      'since',
    ]);
    expect(searchParams.getAll('ids')).toEqual(['3', '5']);
    expect(searchParams.get('since')).toBe('2024-05-01T09:30:00.000Z');
    expect(searchParams.getAll('days')).toEqual([
      '2024-05-02T00:00:00.000Z',
      '2024-05-03T00:00:00.000Z',
    ]);
  });

  test('a query unmounted mid-flight aborts its request', async ({page}) => {
    const hits = await stubApi(page, RECORD_URL, () => new Promise(() => {}));
    const toggle = page.getByRole('button', {name: 'Kayıt sorgusu'});
    await toggle.click();
    await expect(page.getByText('Kayıt bekleniyor…')).toBeVisible();
    await expect.poll(() => hits).toHaveLength(1);
    const failure = page.waitForEvent(
      'requestfailed',
      request => request.url() === RECORD_URL,
    );

    await toggle.click();

    expect((await failure).failure().errorText).toContain('ERR_ABORTED');
    await expectFixtureState(page).toMatchObject({isQueryMounted: false});
  });

  test('a query whose key changes mid-flight aborts the superseded request', async ({
    page,
  }) => {
    const supersededUrl = getApiUrl('/fixtures/entities/1');
    const supersededHits = await stubApi(
      page,
      supersededUrl,
      () => new Promise(() => {}),
    );
    await stubApi(page, getApiUrl('/fixtures/entities/2'), () => ({
      json: getSuccessEnvelope({id: 2, name: 'Varlık 2'}),
    }));
    const next = page.getByRole('button', {name: 'Sonraki varlık'});
    await next.click();
    await expect(page.getByText('Varlık bekleniyor…')).toBeVisible();
    await expect.poll(() => supersededHits).toHaveLength(1);
    const failure = page.waitForEvent(
      'requestfailed',
      request => request.url() === supersededUrl,
    );

    await next.click();

    expect((await failure).failure().errorText).toContain('ERR_ABORTED');
    await expect(page.getByText('Varlık 2')).toBeVisible();
    await expectFixtureState(page).toMatchObject({entityId: 2});
  });

  test('a mutation declaring touchPrincipal refreshes the principal only when its rule says so', async ({
    page,
  }) => {
    await stubApi(page, getApiUrl('/fixtures/profile'), () => ({
      json: getSuccessEnvelope(),
    }));
    const meHits = await stubApi(page, getApiUrl('/auth/me'), () => ({
      json: getSuccessEnvelope(PRINCIPAL),
    }));
    await signIn(page);

    await clickButton(page, 'Başka profili güncelle');
    await expectFixtureState(page).toMatchObject({profile: 'success'});
    await clickButton(page, 'Profilimi güncelle');

    await expectFixtureState(page).toMatchObject({
      session: {principal: PRINCIPAL},
    });
    expect(getAuthorizations(meHits)).toEqual([FIRST_TOKEN]);
  });
  test('every tab follows the persisted session', async ({page, context}) => {
    const otherPage = await context.newPage();
    await openFixture(otherPage, 'api-client');

    await signIn(otherPage);

    await expectFixtureState(page).toMatchObject({session: FIRST_SESSION});

    await clickButton(otherPage, 'Oturumu kapat');

    await expectFixtureState(page).toMatchObject({
      session: {accessToken: null, refreshToken: null},
    });
  });

  test.describe(`when the proactive refresh fails with ${UNAVAILABLE_REFRESH_FAILURE.name}`, () => {
    test.use({
      allowedConsoleError: getFailedRequestPattern({
        [REFRESH_PATH]: [UNAVAILABLE_REFRESH_FAILURE.status],
      }),
    });

    test('a token still valid inside the expiry margin sends the request under itself and keeps the session, in memory and persisted', async ({
      page,
    }) => {
      const [recordHits, refreshHits] = await signInExpiringIn(
        page,
        10,
        unavailableRefreshResponse,
      );

      await clickButton(page, 'Kaydı getir');

      await expectFixtureState(page).toMatchObject({
        requests: {record: {status: 'fulfilled', value: RECORD}},
        session: KEPT_SESSION,
      });
      expect(await readPersistedSession(page)).toMatchObject(FIRST_SESSION);
      expect(getBodies(refreshHits)).toEqual([{refreshToken: 'refresh-1'}]);
      expect(getAuthorizations(recordHits)).toEqual([FIRST_TOKEN]);
    });

    test('an expired token is never sent: the request rejects with the refresh error and the session is kept, in memory and persisted', async ({
      page,
    }) => {
      const [recordHits, refreshHits] = await signInExpiringIn(
        page,
        0,
        unavailableRefreshResponse,
      );

      await clickButton(page, 'Kaydı getir');

      await expectFixtureState(page).toMatchObject({
        requests: {
          record: {
            status: 'rejected',
            error: UNAVAILABLE_REFRESH_FAILURE.error,
          },
        },
        session: KEPT_SESSION,
      });
      expect(await readPersistedSession(page)).toMatchObject(FIRST_SESSION);
      expect(getBodies(refreshHits)).toEqual([{refreshToken: 'refresh-1'}]);
      expect(recordHits).toEqual([]);
    });
  });

  test.describe('on a 401', () => {
    test.use({
      allowedConsoleError: getFailedRequestPattern({
        [FIXTURE_RECORD_PATH]: [StatusCodes.UNAUTHORIZED],
      }),
    });

    test('refreshes once, retries once under the new token, then succeeds', async ({
      page,
    }) => {
      const recordHits = await stubRecordForRefreshedToken(page);
      const refreshHits = await stubApi(page, REFRESH_URL, refreshResponse);
      await signIn(page);

      await clickButton(page, 'Kaydı getir');

      await expectFixtureState(page).toMatchObject({
        requests: {record: {status: 'fulfilled', value: RECORD}},
        session: REFRESHED_SESSION,
      });
      expect(getAuthorizations(recordHits)).toEqual([
        FIRST_TOKEN,
        REFRESHED_TOKEN,
      ]);
      expect(getBodies(refreshHits)).toEqual([{refreshToken: 'refresh-1'}]);
    });

    test('concurrent 401s share a single refresh', async ({page}) => {
      const {promise, resolve} = Promise.withResolvers();
      const recordHits = await stubRecordForRefreshedToken(page);
      const refreshHits = await stubApi(page, REFRESH_URL, async () => {
        await promise;
        return refreshResponse();
      });
      await signIn(page);

      await clickButton(page, 'Üç kayıt getir');

      await expect
        .poll(() => getAuthorizations(recordHits))
        .toEqual([FIRST_TOKEN, FIRST_TOKEN, FIRST_TOKEN]);
      await expect.poll(() => refreshHits).toHaveLength(1);

      resolve();

      await expectFixtureState(page).toMatchObject({
        requests: {
          burst: {status: 'fulfilled', value: [RECORD, RECORD, RECORD]},
        },
      });
      expect(refreshHits).toHaveLength(1);
      expect(getAuthorizations(recordHits).slice(3)).toEqual([
        REFRESHED_TOKEN,
        REFRESHED_TOKEN,
        REFRESHED_TOKEN,
      ]);
    });

    for (const failure of [
      StatusCodes.UNAUTHORIZED,
      StatusCodes.BAD_REQUEST,
      StatusCodes.FORBIDDEN,
    ].map(status => getApiFailure(status, 'Geçersiz token.'))) {
      test.describe(`when the refresh fails with ${failure.name}`, () => {
        test.use({
          allowedConsoleError: getRefreshFailurePattern(
            FIXTURE_RECORD_PATH,
            failure.status,
          ),
        });

        test('a failed refresh expires the session, clears the persisted store and rejects, without leaving the page', async ({
          page,
        }) => {
          await Promise.all([
            stubApi(
              page,
              RECORD_URL,
              unauthorizedResponse('Oturum süresi doldu.'),
            ),
            stubApi(page, REFRESH_URL, () => failure.response),
          ]);
          await signIn(page);

          await clickButton(page, 'Kaydı getir');

          await expectFixtureState(page).toMatchObject({
            requests: {record: {status: 'rejected', error: failure.error}},
            session: EXPIRED_SESSION,
          });
          const [persisted] = await Promise.all([
            readPersistedSession(page),
            expect(page).toHaveURL(FIXTURE_URL),
          ]);
          expect(persisted).toEqual({
            accessToken: null,
            refreshToken: null,
            expiresAt: null,
            principal: null,
          });
        });
      });
    }

    for (const failure of [
      ...getTransientFailures(REFRESH_UNAVAILABLE),
      {
        name: 'a 502 with a non-JSON body',
        status: StatusCodes.BAD_GATEWAY,
        response: {
          status: StatusCodes.BAD_GATEWAY,
          contentType: 'text/html',
          body: '<h1>Bad Gateway</h1>',
        },
        error: {
          message: 'Geçersiz sunucu yanıtı.',
          status: StatusCodes.BAD_GATEWAY,
        },
      },
    ]) {
      test.describe(`when the refresh fails transiently with ${failure.name}`, () => {
        test.use({
          allowedConsoleError: getRefreshFailurePattern(
            FIXTURE_RECORD_PATH,
            failure.status,
          ),
        });

        test('keeps the session, in memory and persisted, and rejects with the refresh error, without leaving the page', async ({
          page,
        }) => {
          const [recordHits, refreshHits] = await Promise.all([
            stubRecordForRefreshedToken(page),
            stubApi(page, REFRESH_URL, () => failure.response),
          ]);
          await signIn(page);

          await clickButton(page, 'Kaydı getir');

          await expectFixtureState(page).toMatchObject({
            requests: {record: {status: 'rejected', error: failure.error}},
            session: KEPT_SESSION,
          });
          const [persisted] = await Promise.all([
            readPersistedSession(page),
            expect(page).toHaveURL(FIXTURE_URL),
          ]);
          expect(persisted).toMatchObject(FIRST_SESSION);
          expect([recordHits.length, refreshHits.length]).toEqual([1, 1]);
        });

        test('the kept session refreshes on the next 401, and the retry succeeds', async ({
          page,
        }) => {
          const [recordHits, refreshHits] = await Promise.all([
            stubRecordForRefreshedToken(page),
            stubApi(
              page,
              REFRESH_URL,
              respondInSequence(failure.response, refreshResponse()),
            ),
          ]);
          await signIn(page);
          await clickButton(page, 'Kaydı getir');
          await expectFixtureState(page).toMatchObject({
            requests: {record: {status: 'rejected'}},
          });

          await clickButton(page, 'Kaydı getir');

          await expectFixtureState(page).toMatchObject({
            requests: {record: {status: 'fulfilled', value: RECORD}},
            session: REFRESHED_SESSION,
          });
          expect(getBodies(refreshHits)).toEqual([
            {refreshToken: 'refresh-1'},
            {refreshToken: 'refresh-1'},
          ]);
          expect(getAuthorizations(recordHits)).toEqual([
            FIRST_TOKEN,
            FIRST_TOKEN,
            REFRESHED_TOKEN,
          ]);
        });
      });
    }

    test('a 401 on the retry expires the session and rejects', async ({
      page,
    }) => {
      const recordHits = await stubApi(
        page,
        RECORD_URL,
        unauthorizedResponse('Oturum geçersiz.'),
      );
      const refreshHits = await stubApi(page, REFRESH_URL, refreshResponse);
      await signIn(page);

      await clickButton(page, 'Kaydı getir');

      await expectFixtureState(page).toMatchObject({
        requests: {
          record: {
            status: 'rejected',
            error: {
              message: 'Oturum geçersiz.',
              status: StatusCodes.UNAUTHORIZED,
            },
          },
        },
        session: EXPIRED_SESSION,
      });
      expect(getAuthorizations(recordHits)).toEqual([
        FIRST_TOKEN,
        REFRESHED_TOKEN,
      ]);
      expect(refreshHits).toHaveLength(1);
    });

    test('without a session a 401 rejects at once, with no refresh', async ({
      page,
    }) => {
      const recordHits = await stubApi(
        page,
        RECORD_URL,
        unauthorizedResponse('Oturum gerekli.'),
      );
      const refreshHits = await stubApi(page, REFRESH_URL, refreshResponse);

      await clickButton(page, 'Kaydı getir');

      await expectFixtureState(page).toMatchObject({
        requests: {
          record: {
            status: 'rejected',
            error: {
              message: 'Oturum gerekli.',
              status: StatusCodes.UNAUTHORIZED,
            },
          },
        },
        session: {sessionExpired: false},
      });
      expect(getAuthorizations(recordHits)).toEqual([null]);
      expect(refreshHits).toEqual([]);
    });

    test('a refresh that lands after the session changed is dropped, and the retry goes out under the new session', async ({
      page,
    }) => {
      const {promise, resolve} = Promise.withResolvers();
      const recordHits = await stubRecordForRefreshedToken(page);
      const refreshHits = await stubApi(page, REFRESH_URL, async () => {
        await promise;
        return refreshResponse();
      });
      await signIn(page);
      await clickButton(page, 'Kaydı getir');
      await expect.poll(() => refreshHits).toHaveLength(1);

      await clickButton(page, 'Başka oturum aç');
      await expectFixtureState(page).toMatchObject({
        session: {accessToken: 'access-2', refreshToken: 'refresh-2'},
      });
      resolve();

      await expectFixtureState(page).toMatchObject({
        requests: {record: {status: 'fulfilled', value: RECORD}},
        session: {accessToken: 'access-2', refreshToken: 'refresh-2'},
      });
      expect(getAuthorizations(recordHits)).toEqual([
        FIRST_TOKEN,
        'Bearer access-2',
      ]);
    });
  });
});
