import {StatusCodes} from 'http-status-codes';
import {getFailedRequestPattern} from '../lib/api.js';
import {
  expectNoSession,
  expectSignedInAs,
  getLoginButton,
  getLoginEmailInput,
  getLoginPasswordInput,
  signOut,
  submitLoginForm,
} from '../lib/auth.js';
import {ADMIN_ACCOUNT, uniqueEmail} from '../lib/backend.js';
import {expect, test} from '../lib/flow-test.js';
import {getSearchBox} from '../lib/list-screen.js';
import {readPersistedSession} from '../lib/session.js';
import {expectToasts} from '../lib/toasts.js';

function expectSignedIn(page, path) {
  return expectSignedInAs(page, ADMIN_ACCOUNT, path);
}

test.use({storageState: {cookies: [], origins: []}});

test.describe('login screen', () => {
  test.beforeEach(async ({page}) => {
    await page.goto('/admin/login');
  });

  test('an empty submit marks both fields with their errors', async ({
    page,
  }) => {
    await getLoginButton(page).click();

    await expect(getLoginEmailInput(page)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(getLoginPasswordInput(page)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.getByText('Geçersiz e-posta')).toBeVisible();
    await expect(page.getByText('Parola boş olamaz')).toBeVisible();
    await expect(getLoginEmailInput(page)).toBeFocused();
  });

  test('a malformed email marks only the email', async ({page}) => {
    await submitLoginForm(page, {email: 'ada@', password: 'parola'});

    await expect(getLoginEmailInput(page)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.getByText('Geçersiz e-posta')).toBeVisible();
    await expect(getLoginPasswordInput(page)).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test.describe('when the server refuses', () => {
    test.use({
      allowedConsoleError: getFailedRequestPattern({
        '/auth/login': [StatusCodes.UNAUTHORIZED],
      }),
    });

    test('a wrong password shows the server’s message and marks no field', async ({
      page,
    }) => {
      await submitLoginForm(page, {
        email: ADMIN_ACCOUNT.email,
        password: `${ADMIN_ACCOUNT.password}-yanlis`,
      });

      await expectToasts(page, ['E-posta veya parola hatalı.']);
      await expect(getLoginEmailInput(page)).not.toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await expect(getLoginPasswordInput(page)).not.toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await expect(page).toHaveURL(/\/admin\/login$/);
      expect(await readPersistedSession(page)).toMatchObject({
        accessToken: null,
      });
    });

    test('a disabled user cannot sign in', async ({
      page,
      backend,
    }, testInfo) => {
      const user = await backend.createUser({
        email: uniqueEmail(testInfo, 'disabled'),
        disabledAt: new Date().toISOString(),
      });

      await submitLoginForm(page, user);

      await expectToasts(page, ['Erişim engellendi.']);
      await expect(page).toHaveURL(/\/admin\/login$/);
    });
  });

  test('a correct sign-in lands on the panel and a reload keeps the session', async ({
    page,
  }) => {
    await submitLoginForm(page, ADMIN_ACCOUNT);

    await expectSignedIn(page, /\/admin$/);
    await expect(page.getByText('Kontrol Paneli')).toBeVisible();
    await expectToasts(page, []);

    await page.reload();

    await expectSignedIn(page, /\/admin$/);
  });

  test('a next target off the site falls back to the panel', async ({page}) => {
    await page.goto('/admin/login?next=https://example.org/admin');

    await submitLoginForm(page, ADMIN_ACCOUNT);

    await expectSignedIn(page, /localhost:\d+\/admin$/);
  });
});

test.describe('signed out', () => {
  test('a panel route redirects to login with ?next=, and signing in returns to its path, search and hash', async ({
    page,
  }) => {
    await page.goto('/admin/users?search=admin#e2e');

    await expect(page).toHaveURL(
      /\/admin\/login\?next=%2Fadmin%2Fusers%3Fsearch%3Dadmin%23e2e$/,
    );

    await submitLoginForm(page, ADMIN_ACCOUNT);

    await expectSignedIn(page, /\/admin\/users\?search=admin#e2e$/);
    await expect(getSearchBox(page, 'ID, E-posta…')).toHaveValue('admin');
  });
});

test.describe('signed in', () => {
  test.beforeEach(async ({page}) => {
    await page.goto('/admin/login');
    await submitLoginForm(page, ADMIN_ACCOUNT);
    await expectSignedIn(page, /\/admin$/);
  });

  test('the login screen sends a signed-in visitor on to its next target', async ({
    page,
  }) => {
    await page.goto('/admin/login?next=%2Fadmin%2Froles');

    await expectSignedIn(page, /\/admin\/roles$/);
  });

  test('logout clears the session and a panel route redirects again', async ({
    page,
  }) => {
    await signOut(page);

    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin$/);
    await expectNoSession(page);

    await page.goto('/admin/roles');

    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Froles$/);
    await expect(getLoginButton(page)).toBeVisible();
  });

  test('a second tab follows a logout performed in the first, with no toast', async ({
    context,
    page,
  }) => {
    const second = await context.newPage();
    await second.goto('/admin/users');
    await expectSignedIn(second, /\/admin\/users$/);

    await signOut(page);

    await expect(second).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fusers$/);
    await expect(getLoginButton(second)).toBeVisible();
    await expectToasts(second, []);
  });
});
