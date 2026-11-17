import {StatusCodes} from 'http-status-codes';
import {Permission} from '@repo/shared/constants/permission.js';
import {
  FIXTURE_RECORD_PATH,
  REFRESH_PATH,
  getApiUrl,
  getErrorEnvelope,
  getFailedRequestPattern,
  getPrincipal,
  getRefreshFailurePattern,
  getSuccessEnvelope,
  stubApi,
} from '../lib/api.js';
import {expectFixtureState, openFixture} from '../lib/fixture-page.js';
import {getSessionStorageStateFixture} from '../lib/session.js';
import {expect, test} from '../lib/test.js';
import {expectToasts} from '../lib/toasts.js';

const ME_URL = getApiUrl('/auth/me');
const ALL_PERMISSIONS = [Permission.ADMIN, Permission.USER_MANAGE_PEER];

function stubPrincipal(page, permissions, until) {
  return stubApi(page, ME_URL, async () => {
    await until;
    return {json: getSuccessEnvelope(getPrincipal(permissions))};
  });
}

function getRecordButton(page) {
  return page.getByRole('button', {name: 'Kaydı getir'});
}

function getManageButton(page) {
  return page.getByRole('button', {name: 'Kullanıcıları yönet'});
}

function getAdminSection(page) {
  return page.getByRole('region', {name: 'Yönetim bölümü'});
}

function getAdminContent(page) {
  return getAdminSection(page).getByText('Yönetim içeriği.');
}

function getLoginHeading(page) {
  return page.getByRole('heading', {level: 1, name: 'Fixtures'});
}

test.describe('require session', () => {
  test('without a session redirects to the login route, with ?next= carrying the current path and search', async ({
    page,
  }) => {
    const meHits = await stubPrincipal(page, ALL_PERMISSIONS);

    await page.goto('/admin/fixtures/require-session?tab=izinler');

    await expect(page).toHaveURL(
      /\/admin\/fixtures\?next=%2Fadmin%2Ffixtures%2Frequire-session%3Ftab%3Dizinler$/,
    );
    await expect(getLoginHeading(page)).toBeVisible();
    await expectToasts(page, []);
    expect(meHits).toEqual([]);
  });

  test.describe('with a session', () => {
    test.use({
      storageState: getSessionStorageStateFixture({
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        expiresAt: Date.now() + 3_600_000,
        principal: null,
      }),
    });

    test('renders the subtree while the principal is still loading; a permission control appears only once it lands', async ({
      page,
    }) => {
      const {promise, resolve} = Promise.withResolvers();
      const meHits = await stubPrincipal(page, ALL_PERMISSIONS, promise);

      await openFixture(page, 'require-session');

      await expect(getRecordButton(page)).toBeVisible();
      await expect(getAdminContent(page)).toBeVisible();
      await expect.poll(() => meHits).toHaveLength(1);
      expect(meHits[0].authorization).toBe('Bearer access-1');
      await expectFixtureState(page).toMatchObject({principal: null});
      await expect(getManageButton(page)).toHaveCount(0);

      resolve();

      await expect(getManageButton(page)).toBeVisible();
      await expect(getAdminContent(page)).toBeVisible();
      await expectFixtureState(page).toMatchObject({
        principal: getPrincipal(ALL_PERMISSIONS),
      });
    });

    test('a principal without the permissions fails closed: the boundary renders forbidden and the control stays hidden', async ({
      page,
    }) => {
      await stubPrincipal(page, []);

      await openFixture(page, 'require-session');

      const section = getAdminSection(page);
      await expect(
        section.getByRole('heading', {name: 'Erişim engellendi!'}),
      ).toBeVisible();
      await expect(
        section.getByText('Bu sayfayı görüntüleme yetkiniz yok.'),
      ).toBeVisible();
      await expect(getAdminContent(page)).toHaveCount(0);
      await expect(getManageButton(page)).toHaveCount(0);
      await expect(getRecordButton(page)).toBeVisible();
    });

    test('each permission decides on its own: the boundary opens while a control needing another one stays hidden', async ({
      page,
    }) => {
      await stubPrincipal(page, [Permission.ADMIN]);

      await openFixture(page, 'require-session');

      await expectFixtureState(page).toMatchObject({
        principal: {permissions: [Permission.ADMIN]},
      });
      await expect(getAdminContent(page)).toBeVisible();
      await expect(getManageButton(page)).toHaveCount(0);
    });

    test.describe('when the principal cannot be fetched', () => {
      test.use({
        allowedConsoleError: getFailedRequestPattern({
          '/auth/me': [StatusCodes.INTERNAL_SERVER_ERROR],
        }),
      });

      test('shows the connection error page, and its retry loads the subtree', async ({
        page,
      }) => {
        let isFailing = true;
        const meHits = await stubApi(page, ME_URL, () =>
          isFailing
            ? {
                status: StatusCodes.INTERNAL_SERVER_ERROR,
                json: getErrorEnvelope('Sunucu hatası.'),
              }
            : {json: getSuccessEnvelope(getPrincipal(ALL_PERMISSIONS))},
        );

        await openFixture(page, 'require-session');

        await expect(
          page.getByRole('heading', {name: 'Bağlantı kurulamadı'}),
        ).toBeVisible();
        await expect(page.getByText('Sunucu hatası.')).toBeVisible();
        await expect(getRecordButton(page)).toHaveCount(0);

        isFailing = false;
        await page.getByRole('button', {name: 'Yeniden dene'}).click();

        await expect(getManageButton(page)).toBeVisible();
        await expect(getRecordButton(page)).toBeVisible();
        expect(meHits).toHaveLength(2);
      });
    });

    test.describe('when the session cannot be refreshed', () => {
      test.use({
        allowedConsoleError: getRefreshFailurePattern(
          FIXTURE_RECORD_PATH,
          StatusCodes.UNAUTHORIZED,
        ),
      });

      test('a request that expires the session toasts it and redirects to login with ?next=', async ({
        page,
      }) => {
        await stubPrincipal(page, ALL_PERMISSIONS);
        await stubApi(page, getApiUrl(FIXTURE_RECORD_PATH), () => ({
          status: StatusCodes.UNAUTHORIZED,
          json: getErrorEnvelope('Oturum süresi doldu.'),
        }));
        await stubApi(page, getApiUrl(REFRESH_PATH), () => ({
          status: StatusCodes.UNAUTHORIZED,
          json: getErrorEnvelope('Geçersiz token.'),
        }));
        await openFixture(page, 'require-session');

        await getRecordButton(page).click();

        await expect(page).toHaveURL(
          /\/admin\/fixtures\?next=%2Fadmin%2Ffixtures%2Frequire-session$/,
        );
        await expectToasts(page, ['Oturumunuz sona erdi.']);
        await expect(getLoginHeading(page)).toBeVisible();
      });
    });
  });
});
