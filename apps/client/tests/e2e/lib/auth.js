import {readPersistedSession} from './session.js';
import {expect} from './test.js';

export function getLoginEmailInput(page) {
  return page.getByRole('textbox', {name: 'E-posta'});
}

export function getLoginPasswordInput(page) {
  return page.getByRole('textbox', {name: 'Parola'});
}

export function getLoginButton(page) {
  return page.getByRole('button', {name: 'Giriş Yap'});
}

export async function submitLoginForm(page, {email, password}) {
  await getLoginEmailInput(page).fill(email);
  await getLoginPasswordInput(page).fill(password);
  await getLoginButton(page).click();
}

export function getUserMenu(page) {
  return page.getByRole('button', {name: /Kullanıcı menüsü$/});
}

export function getSignOutItem(page) {
  return page.getByRole('menuitem', {name: 'Çıkış yap'});
}

export async function expectSignedInAs(page, {email}, url) {
  if (url) {
    await expect(page).toHaveURL(url);
  }
  await expect(getUserMenu(page)).toContainText(email);
}

export function expectNoSession(page) {
  return expect
    .poll(() => readPersistedSession(page))
    .toMatchObject({
      accessToken: null,
      refreshToken: null,
      principal: null,
    });
}

export async function signOut(page) {
  await getUserMenu(page).click();
  await getSignOutItem(page).click();
}
