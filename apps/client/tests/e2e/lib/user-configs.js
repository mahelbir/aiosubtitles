import {escapeRegExp} from 'es-toolkit';
import {SUBTITLE_LANGUAGE_LIMIT_DEFAULT} from '@repo/shared/constants/user-config.js';
import {getApiUrl} from './api.js';
import {gotoWithQuery} from './page.js';
import {expect, test as base} from './test.js';

export const USER_CONFIGS_PATH = '/api/user-configs';

export const USER_CONFIG_PATH = `${USER_CONFIGS_PATH}/:userConfigId`;

export const USER_CONFIG_SESSIONS_PATH = `${USER_CONFIG_PATH}/sessions`;

export const CONFIGURE_PATH = '/configure';

export const LOGIN_REFUSAL = 'Wrong configuration ID or password.';

export const SESSION_REFUSAL =
  'Your session expired. Enter your password again.';

export const UNSAVED_TEXT = 'You have unsaved changes';

export const SAVED_TEXT = 'All changes saved';

export const NOT_SAVED_YET_TEXT = 'Not saved yet';

export const MANIFEST_URL_PATTERN = /\/[0-9a-f-]{36}\/manifest\.json$/;

export function getUserConfigPath(userConfigId) {
  return `${USER_CONFIGS_PATH}/${userConfigId}`;
}

export function getSessionStorageKey(userConfigId) {
  return `aiosubtitles-user-config-session:${userConfigId}`;
}

export async function callApi(
  request,
  method,
  path,
  {sessionToken, data} = {},
) {
  const response = await request.fetch(getApiUrl(path), {
    method,
    data,
    headers: sessionToken ? {authorization: `Bearer ${sessionToken}`} : {},
  });
  await expect(response, `${method} ${path}`).toBeOK();
  return (await response.json()).data;
}

export function openUserConfigSession(request, {userConfigId, password}) {
  return callApi(
    request,
    'POST',
    `${getUserConfigPath(userConfigId)}/sessions`,
    {
      data: {password},
    },
  );
}

async function deleteUserConfig(request, {userConfigId, password}) {
  const {sessionToken} = await openUserConfigSession(request, {
    userConfigId,
    password,
  });
  await callApi(request, 'DELETE', getUserConfigPath(userConfigId), {
    sessionToken,
    data: {password},
  });
}

export const test = base.extend({
  userConfigs: [
    async ({request}, use) => {
      const created = [];
      await use({
        track: userConfig => {
          created.push(userConfig);
          return userConfig;
        },
        create: async ({password, languageCodes, credentials = []}) => {
          const createdUserConfig = await callApi(
            request,
            'POST',
            USER_CONFIGS_PATH,
            {
              data: {
                password,
                languageCodes,
                subtitleLanguageLimit: SUBTITLE_LANGUAGE_LIMIT_DEFAULT,
                subtitleSourceSwitchStates: {},
                credentials,
              },
            },
          );
          created.push({
            userConfigId: createdUserConfig.userConfigId,
            password,
          });
          return {...createdUserConfig, password};
        },
        changePassword: async ({userConfigId, sessionToken, newPassword}) => {
          const userConfig = created.find(
            entry => entry.userConfigId === userConfigId,
          );
          const changed = await callApi(
            request,
            'PUT',
            `${getUserConfigPath(userConfigId)}/password`,
            {
              sessionToken,
              data: {currentPassword: userConfig.password, newPassword},
            },
          );
          userConfig.password = newPassword;
          return changed;
        },
      });
      await Promise.all(
        created.map(userConfig => deleteUserConfig(request, userConfig)),
      );
    },
    {scope: 'test'},
  ],
});

export {expect};

export function writeSessionToken(page, {userConfigId, sessionToken}) {
  return page.addInitScript(
    ([sessionStorageKey, token]) => {
      if (window.sessionStorage.getItem(sessionStorageKey) === null) {
        window.sessionStorage.setItem(sessionStorageKey, token);
      }
    },
    [getSessionStorageKey(userConfigId), sessionToken],
  );
}

export function readSessionToken(page, userConfigId) {
  return page.evaluate(
    sessionStorageKey => window.sessionStorage.getItem(sessionStorageKey),
    getSessionStorageKey(userConfigId),
  );
}

export function openConfigure(page, query) {
  return gotoWithQuery(page, CONFIGURE_PATH, query);
}

export async function openSignedIn(page, userConfig, query = {}) {
  await writeSessionToken(page, userConfig);
  await openConfigure(page, {userConfigId: userConfig.userConfigId, ...query});
}

export function getMain(page) {
  return page.getByRole('main');
}

export function getNavItem(page, label) {
  return page
    .getByRole('navigation', {name: 'Settings sections'})
    .getByRole('button', {name: label, exact: true});
}

export function getVisibleSaveButton(page) {
  return page.getByRole('button', {name: 'Save', exact: true}).filter({
    visible: true,
  });
}

export function getPasswordField(scope) {
  return scope.getByLabel('Password', {exact: true});
}

export function getConfigurationIdField(scope) {
  return scope.getByLabel('Configuration ID', {exact: true});
}

export function getSetPasswordDialog(page) {
  return page
    .getByRole('dialog')
    .filter({has: page.getByLabel('Repeat password', {exact: true})});
}

export function getPasswordDialog(page) {
  return page.getByRole('dialog').filter({has: getPasswordField(page)});
}

export function getLabelPattern(label) {
  return new RegExp(`^${escapeRegExp(label)}(?: \\(|$)`);
}

export function getAddLanguageButton(page) {
  return getMain(page).getByRole('button', {name: 'Add language', exact: true});
}

export function getLanguagePickers(page) {
  return getMain(page).getByRole('combobox');
}

export function getLanguageOption(page, label) {
  return page.getByRole('option', {name: getLabelPattern(label)});
}

export async function openNextLanguagePicker(page, search) {
  await getAddLanguageButton(page).click();
  await getLanguagePickers(page).last().click();
  await page.keyboard.type(search);
}

export async function addLanguage(page, label) {
  await openNextLanguagePicker(page, label);
  await getLanguageOption(page, label).click();
  await expect(getLanguage(page, label)).toBeVisible();
}

export function getLanguage(page, label) {
  return getLanguagePickers(page).filter({hasText: getLabelPattern(label)});
}

export async function submitPassword(scope, password) {
  const field = getPasswordField(scope);
  await field.fill(password);
  await field.press('Enter');
}
