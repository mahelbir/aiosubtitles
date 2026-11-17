import {StatusCodes} from 'http-status-codes';
import {getFailedRequestPattern} from '../lib/api.js';
import {getUserMenu, signOut, submitLoginForm} from '../lib/auth.js';
import {accountFixtures, uniqueEmail} from '../lib/backend.js';
import {expect, test as base} from '../lib/flow-test.js';
import {getSaveButton, getTab, getTabPanel} from '../lib/locators.js';
import {expectSearchParams} from '../lib/page.js';
import {recordApiRequests} from '../lib/requests.js';
import {expectToasts, getToasts} from '../lib/toasts.js';

const NEW_PASSWORD = 'Yeni-parola-1';

const test = base.extend(accountFixtures);

function getPasswordPanel(page) {
  return getTabPanel(page, 'Parola Değiştir');
}

async function fillPasswordForm(page, {current, next, repeat = next}) {
  const panel = getPasswordPanel(page);
  await panel.getByLabel('Mevcut Parola').pressSequentially(current);
  await panel.getByLabel('Yeni Parola', {exact: true}).pressSequentially(next);
  await panel.getByLabel('Yeni Parola (Tekrar)').pressSequentially(repeat);
}

test.beforeEach(async ({page, account}) => {
  await page.goto('/admin/profile');
  await expect(getUserMenu(page)).toContainText(account.email);
});

test('a changed email persists and the user menu follows it', async ({
  page,
  account,
}, testInfo) => {
  const email = uniqueEmail(testInfo, 'renamed');
  const input = page.getByRole('textbox', {name: 'E-posta'});
  await expect(input).toHaveValue(account.email);

  await input.clear();
  await input.pressSequentially(email);
  await getSaveButton(page).click();

  await expectToasts(page, ['Profil güncellendi.']);
  await expect(getUserMenu(page)).toContainText(email);

  await page.reload();

  await expect(input).toHaveValue(email);
});

test('a tab switch writes the URL and a reload restores it', async ({page}) => {
  await expect(getTab(page, 'Profil Bilgileri')).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await getTab(page, 'Parola Değiştir').click();

  await expectSearchParams(page).toEqual({tab: 'password'});
  await expect(
    getPasswordPanel(page).getByLabel('Mevcut Parola'),
  ).toBeVisible();

  await page.reload();

  await expect(getTab(page, 'Parola Değiştir')).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await getTab(page, 'Profil Bilgileri').click();

  await expectSearchParams(page).toEqual({});
});

test.describe('a mismatched repeat', () => {
  let passwordRequests;

  test.beforeEach(async ({page, account}) => {
    passwordRequests = recordApiRequests(page, '/users/me/password');
    await getTab(page, 'Parola Değiştir').click();
    await fillPasswordForm(page, {
      current: account.password,
      next: NEW_PASSWORD,
      repeat: `${NEW_PASSWORD}x`,
    });
    await page.keyboard.press('Tab');
    await getSaveButton(page).click();
  });

  test('is caught before the server is asked', async ({page}) => {
    await expect(
      getPasswordPanel(page).getByText('Parolalar eşleşmiyor'),
    ).toBeVisible();
    await expect(
      getPasswordPanel(page).getByLabel('Yeni Parola (Tekrar)'),
    ).toHaveAttribute('aria-invalid', 'true');
    await expectToasts(page, []);
    expect(passwordRequests).toHaveLength(0);
  });

  test('the error shown on leaving the field takes the focus when the submit fails', async ({
    page,
  }) => {
    await expect(
      getPasswordPanel(page).getByLabel('Yeni Parola (Tekrar)'),
    ).toBeFocused();
  });
});

test.describe('when the server refuses the current password', () => {
  test.use({
    allowedConsoleError: getFailedRequestPattern({
      '/users/me/password': [StatusCodes.FORBIDDEN],
    }),
  });

  test('a wrong current password is rejected with the server’s message', async ({
    page,
  }) => {
    const wrongPassword = `${NEW_PASSWORD}-yanlis`;
    await getTab(page, 'Parola Değiştir').click();
    await fillPasswordForm(page, {current: wrongPassword, next: NEW_PASSWORD});

    await getSaveButton(page).click();

    await expectToasts(page, ['Mevcut parola hatalı.']);
    await expect(
      getPasswordPanel(page).getByLabel('Mevcut Parola'),
    ).toHaveValue(wrongPassword);
  });
});

test.describe('when the server refuses the old password', () => {
  test.use({
    allowedConsoleError: getFailedRequestPattern({
      '/auth/login': [StatusCodes.UNAUTHORIZED],
    }),
  });

  test('a changed password signs in, and the old one no longer does', async ({
    page,
    account,
  }) => {
    await getTab(page, 'Parola Değiştir').click();
    await fillPasswordForm(page, {
      current: account.password,
      next: NEW_PASSWORD,
    });

    await getSaveButton(page).click();

    await expectToasts(page, ['Parola güncellendi.']);
    await expect(
      getPasswordPanel(page).getByLabel('Mevcut Parola'),
    ).toHaveValue('');

    await signOut(page);
    await submitLoginForm(page, account);

    await expect(
      getToasts(page).filter({hasText: 'E-posta veya parola hatalı.'}),
    ).toBeVisible();

    await submitLoginForm(page, {...account, password: NEW_PASSWORD});

    await expect(page).toHaveURL(/\/admin\/profile\?tab=password$/);
    await expect(getUserMenu(page)).toContainText(account.email);
  });
});
