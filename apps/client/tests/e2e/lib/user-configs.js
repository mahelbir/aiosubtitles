import {escapeRegExp} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {SUBTITLE_LANGUAGE_LIMIT_DEFAULT} from '@repo/shared/constants/user-config.js';
import {getApiUrl} from './api.js';
import {getForm, getMain, getSectionPicker} from './locators.js';
import {gotoWithQuery} from './page.js';
import {expect, test as base} from './test.js';
import {isPhoneLayout} from './viewport.js';

export const USER_CONFIGS_PATH = '/api/user-configs';

export const USER_CONFIG_PATH = `${USER_CONFIGS_PATH}/:userConfigId`;

export const USER_CONFIG_SESSIONS_PATH = `${USER_CONFIG_PATH}/sessions`;

export const CONFIGURE_PATH = '/configure';

export const LOGIN_REFUSAL = 'Wrong configuration ID or password.';

export const SESSION_REFUSAL =
  'Your session expired. Enter your password again.';

const UNSAVED_PATTERN = /^(?:You have unsaved changes|Unsaved changes)$/;

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
  {sessionToken, data, acceptedStatuses = []} = {},
) {
  const response = await request.fetch(getApiUrl(path), {
    method,
    data,
    headers: sessionToken ? {authorization: `Bearer ${sessionToken}`} : {},
  });
  if (acceptedStatuses.includes(response.status())) {
    return null;
  }
  await expect(response, `${method} ${path}`).toBeOK();
  return (await response.json()).data;
}

export function openUserConfigSession(
  request,
  {userConfigId, password},
  {acceptedStatuses} = {},
) {
  return callApi(
    request,
    'POST',
    `${getUserConfigPath(userConfigId)}/sessions`,
    {
      data: {password},
      acceptedStatuses,
    },
  );
}

function deleteWithSession(request, {userConfigId, password}, sessionToken) {
  return callApi(request, 'DELETE', getUserConfigPath(userConfigId), {
    sessionToken,
    data: {password},
  });
}

async function deleteUserConfig(request, userConfig) {
  const {sessionToken} = await openUserConfigSession(request, userConfig);
  await deleteWithSession(request, userConfig, sessionToken);
}

async function deleteLeftUserConfig(request, userConfig, acceptedStatuses) {
  const session = await openUserConfigSession(request, userConfig, {
    acceptedStatuses,
  });
  if (session) {
    await deleteWithSession(request, userConfig, session.sessionToken);
  }
}

export const test = base.extend({
  userConfigs: [
    async ({request}, use, testInfo) => {
      const created = [];
      const findCreated = userConfigId =>
        created.find(entry => entry.userConfigId === userConfigId);
      const forget = userConfigId => {
        const index = created.findIndex(
          entry => entry.userConfigId === userConfigId,
        );
        if (index !== -1) {
          created.splice(index, 1);
        }
      };
      await use({
        setPassword: ({userConfigId, password}) => {
          findCreated(userConfigId).password = password;
        },
        forget,
        remove: async userConfigId => {
          await deleteUserConfig(request, findCreated(userConfigId));
          forget(userConfigId);
        },
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
          const userConfig = findCreated(userConfigId);
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
      const acceptedStatuses =
        testInfo.status === testInfo.expectedStatus
          ? []
          : [StatusCodes.UNAUTHORIZED];
      await Promise.all(
        created.map(userConfig =>
          deleteLeftUserConfig(request, userConfig, acceptedStatuses),
        ),
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

export function getAllSourcesCheckbox(page) {
  return getMain(page).getByRole('checkbox', {
    name: 'All sources',
    exact: true,
  });
}

export function getUnsavedNotice(page) {
  return page.getByText(UNSAVED_PATTERN).filter({visible: true});
}

export async function openSection(page, label) {
  if (!isPhoneLayout(page)) {
    await page
      .getByRole('navigation', {name: 'Settings sections'})
      .getByRole('button', {name: label, exact: true})
      .click();
    return;
  }
  const picker = getSectionPicker(page);
  await picker.click();
  await page.getByRole('option', {name: label, exact: true}).click();
  await expect(picker).toHaveText(label);
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
  return getForm(page, 'Subtitle settings').getByRole('combobox');
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
