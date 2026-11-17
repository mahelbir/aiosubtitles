import {uniq} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {
  NETWORK_FAILURE_STATUS,
  REFRESH_PATH,
  getApiFailure,
  getApiUrl,
  getFailedRequestPattern,
  getRefreshFailurePattern,
  stubApi,
} from '../lib/api.js';
import {
  expectNoSession,
  expectSignedInAs,
  getSignOutItem,
  getUserMenu,
  signOut,
} from '../lib/auth.js';
import {
  ADMIN_ACCOUNT,
  accountFixtures,
  callApi,
  signIn,
} from '../lib/backend.js';
import {expect, test as base} from '../lib/flow-test.js';
import {getNoRecords, getSearchBox} from '../lib/list-screen.js';
import {getTableRow} from '../lib/locators.js';
import {gotoWithQuery} from '../lib/page.js';
import {
  getAnsweredResponses,
  getAnsweredStatuses,
  holdRequest,
  recordApiRequests,
  recordRequests,
} from '../lib/requests.js';
import {
  ADMIN_STORAGE_STATE_PATH,
  readPersistedSession,
  toPersistedSession,
  writePersistedSession,
} from '../lib/session.js';
import {expectToasts} from '../lib/toasts.js';

const test = base.extend(accountFixtures);

const ME_PATH = '/auth/me';
const LOGOUT_PATH = '/auth/logout';
const PROFILE_PATH = '/users/me';
const PANEL_LOGIN_URL = /\/admin\/login\?next=%2Fadmin$/;
const SESSION_EXPIRED_TOAST = 'Oturumunuz sona erdi.';
const EXPIRING_IN_MS = 10_000;
const LOGOUT_FAILURES = [
  getApiFailure(StatusCodes.INTERNAL_SERVER_ERROR, 'Sunucu hatası.'),
  getApiFailure(NETWORK_FAILURE_STATUS),
];
const MID_SESSION_BLOCKS = [
  {
    state: 'disabled',
    block: ({backend, account}) =>
      backend.updateUser(account.id, {disabledAt: new Date().toISOString()}),
  },
  {
    state: 'deleted',
    block: ({backend, account}) => backend.deleteUser(account.id),
  },
];

async function expectFirstAnswer(requests, status, message) {
  const [response] = await getAnsweredResponses(requests);
  expect(response.status()).toBe(status);
  expect(await response.json()).toMatchObject({success: false, message});
}

async function openPanel(page, account) {
  await page.goto('/admin');
  await expectSignedInAs(page, account);
}

test.describe('the access token', () => {
  test('a token about to expire is refreshed before the principal is fetched', async ({
    page,
    account,
  }) => {
    await openPanel(page, account);
    const session = await readPersistedSession(page);
    await writePersistedSession(page, {
      ...session,
      expiresAt: Date.now() + EXPIRING_IN_MS,
    });
    const refreshUrl = getApiUrl(REFRESH_PATH);
    const principalUrl = getApiUrl(ME_PATH);
    const requests = recordRequests(page, request =>
      [refreshUrl, principalUrl].includes(request.url()),
    );
    const readUrls = () => requests.map(request => request.url());

    await page.reload();

    await expect
      .poll(() => uniq(readUrls()))
      .toEqual([refreshUrl, principalUrl]);
    expect(readUrls().filter(url => url === refreshUrl)).toHaveLength(1);
    const refreshed = await readPersistedSession(page);
    expect(refreshed.accessToken).not.toBe(session.accessToken);
    expect(refreshed.refreshToken).toBe(session.refreshToken);
    expect(refreshed.expiresAt).toBeGreaterThan(Date.now() + EXPIRING_IN_MS);
    await expectSignedInAs(page, account);
  });

  test.describe('when the access token is refused', () => {
    test.use({
      allowedConsoleError: getFailedRequestPattern({
        [ME_PATH]: [StatusCodes.UNAUTHORIZED],
      }),
    });

    test('a refused access token is refreshed and the request retried, with no toast', async ({
      page,
      account,
    }) => {
      await openPanel(page, account);
      const session = await readPersistedSession(page);
      await writePersistedSession(page, {
        ...session,
        accessToken: session.refreshToken,
      });
      const principals = recordApiRequests(page, ME_PATH);
      const refreshes = recordApiRequests(page, REFRESH_PATH);

      await page.reload();

      await expect
        .poll(async () => (await readPersistedSession(page)).accessToken)
        .not.toBe(session.refreshToken);
      await expectFirstAnswer(
        principals,
        StatusCodes.UNAUTHORIZED,
        'Geçersiz oturum.',
      );
      const retried = [StatusCodes.UNAUTHORIZED, StatusCodes.OK];
      const refetchedForTheNewToken = [StatusCodes.OK];
      await expect
        .poll(() => getAnsweredStatuses(principals))
        .toEqual([...retried, ...refetchedForTheNewToken]);
      expect(await getAnsweredStatuses(refreshes)).toEqual([StatusCodes.OK]);
      await expectSignedInAs(page, account);
      await expectToasts(page, []);
    });
  });

  test.describe('when the refresh is refused too', () => {
    test.use({
      allowedConsoleError: getRefreshFailurePattern(
        ME_PATH,
        StatusCodes.UNAUTHORIZED,
      ),
    });

    test('a refused refresh expires the session with a toast and sends the visitor to sign in', async ({
      page,
      account,
    }) => {
      await openPanel(page, account);
      const session = await readPersistedSession(page);
      await writePersistedSession(page, {
        ...session,
        accessToken: session.refreshToken,
        refreshToken: session.accessToken,
      });
      const refreshes = recordApiRequests(page, REFRESH_PATH);

      await page.reload();

      await expect(page).toHaveURL(PANEL_LOGIN_URL);
      await expectToasts(page, [SESSION_EXPIRED_TOAST]);
      await expectFirstAnswer(
        refreshes,
        StatusCodes.UNAUTHORIZED,
        'Geçersiz token.',
      );
      await expectNoSession(page);
    });
  });
});

test.describe('when the account changes mid-session', () => {
  test.describe('when it is blocked', () => {
    test.use({
      allowedConsoleError: getRefreshFailurePattern(
        ME_PATH,
        StatusCodes.UNAUTHORIZED,
      ),
    });

    for (const {state, block} of MID_SESSION_BLOCKS) {
      test(`an account ${state} mid-session is signed out on its next request`, async ({
        page,
        backend,
        account,
      }) => {
        await openPanel(page, account);
        await block({backend, account});
        const principals = recordApiRequests(page, ME_PATH);
        const refreshes = recordApiRequests(page, REFRESH_PATH);

        await page.reload();

        await expect(page).toHaveURL(PANEL_LOGIN_URL);
        await expectToasts(page, [SESSION_EXPIRED_TOAST]);
        await expectFirstAnswer(
          principals,
          StatusCodes.UNAUTHORIZED,
          'Erişim engellendi.',
        );
        await expectFirstAnswer(
          refreshes,
          StatusCodes.UNAUTHORIZED,
          'Erişim engellendi.',
        );
        await expectNoSession(page);
      });
    }
  });

  test.describe('when its role loses the permission', () => {
    test.use({
      allowedConsoleError: getFailedRequestPattern({
        [PROFILE_PATH]: [StatusCodes.FORBIDDEN],
      }),
    });

    test('the next request is refused at once, and the panel closes only on reload', async ({
      page,
      backend,
      account,
    }) => {
      await openPanel(page, account);
      await backend.updateRole(account.roleId, {permissions: []});

      await getUserMenu(page).click();
      await page.getByRole('menuitem', {name: 'Profil'}).click();

      await expect(page).toHaveURL(/\/admin\/profile$/);
      await expect(
        page.getByRole('alert').filter({hasText: 'İzin yok.'}),
      ).toBeVisible();
      await expectToasts(page, []);
      await expect(getUserMenu(page)).toBeVisible();

      await page.reload();

      await expect(
        page.getByRole('heading', {name: 'Erişim engellendi!'}),
      ).toBeVisible();
      await expect(getUserMenu(page)).toHaveCount(0);
    });
  });
});

test.describe('signing out', () => {
  test('signing out tells the API, yet the refresh token keeps working', async ({
    page,
    request,
    account,
  }) => {
    await openPanel(page, account);
    const {accessToken, refreshToken} = await readPersistedSession(page);
    const logouts = recordApiRequests(page, LOGOUT_PATH);

    await signOut(page);

    await expect(page).toHaveURL(PANEL_LOGIN_URL);
    const [logout] = logouts;
    expect(logout.method()).toBe('POST');
    expect(await logout.headerValue('authorization')).toBe(
      `Bearer ${accessToken}`,
    );
    expect((await logout.response()).status()).toBe(StatusCodes.OK);
    await callApi(request, 'POST', REFRESH_PATH, {data: {refreshToken}});
  });

  for (const failure of LOGOUT_FAILURES) {
    test.describe(`when the logout fails with ${failure.name}`, () => {
      test.use({
        allowedConsoleError: getFailedRequestPattern({
          [LOGOUT_PATH]: [failure.status],
        }),
      });

      test('signing out still clears the session and leaves for sign-in, with no toast', async ({
        page,
        account,
      }) => {
        const logouts = await stubApi(
          page,
          getApiUrl(LOGOUT_PATH),
          () => failure.response,
        );
        await openPanel(page, account);

        await signOut(page);

        await expect(page).toHaveURL(PANEL_LOGIN_URL);
        expect(logouts).toHaveLength(1);
        await expectNoSession(page);
        await expectToasts(page, []);
      });
    });
  }

  test('the sign-out item is disabled while the logout is pending', async ({
    page,
    account,
  }) => {
    const logout = await holdRequest(page, getApiUrl(LOGOUT_PATH));
    await openPanel(page, account);
    await getUserMenu(page).click();
    const signOutItem = getSignOutItem(page);

    await signOutItem.click();
    await logout.request;
    await expect(signOutItem).toBeHidden();
    await getUserMenu(page).click();

    await expect(signOutItem).toBeDisabled();

    logout.release();

    await expect(page).toHaveURL(PANEL_LOGIN_URL);
    await expectNoSession(page);
  });
});

test.describe('switching identity', () => {
  test.use({storageState: ADMIN_STORAGE_STATE_PATH});

  test('a session switched in another tab drops the cached data of the previous one', async ({
    context,
    page,
    request,
    account,
  }) => {
    const searchBox = getSearchBox(page, 'ID, E-posta…');
    const adminRow = getTableRow(page, ADMIN_ACCOUNT.email);
    await gotoWithQuery(page, '/admin/users', {search: ADMIN_ACCOUNT.email});
    await expect(adminRow).toBeVisible();
    const tokens = await signIn(request, account);
    const other = await context.newPage();
    await other.goto('/admin/fixtures');

    await writePersistedSession(other, toPersistedSession(tokens));

    await expectSignedInAs(page, account);
    await expect(adminRow).toBeVisible();

    await searchBox.fill(account.email);
    await expect(getTableRow(page, account.email)).toBeVisible();
    await searchBox.fill(ADMIN_ACCOUNT.email);

    await expect(getNoRecords(page)).toBeVisible();
    await expect(adminRow).toHaveCount(0);
  });
});
