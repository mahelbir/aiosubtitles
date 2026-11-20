import {StatusCodes} from 'http-status-codes';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {getApiUrl, getFailedRequestPattern} from '../lib/api.js';
import {getMain, getVisibleText} from '../lib/locators.js';
import {expectSearchParams} from '../lib/page.js';
import {recordRequests} from '../lib/requests.js';
import {expectToasts} from '../lib/toasts.js';
import {
  LOGIN_REFUSAL,
  NOT_SAVED_YET_TEXT,
  SESSION_REFUSAL,
  USER_CONFIG_PATH,
  USER_CONFIG_SESSIONS_PATH,
  addLanguage,
  callApi,
  expect,
  getConfigurationIdField,
  getLanguage,
  getPasswordDialog,
  getPasswordField,
  getUserConfigPath,
  openConfigure,
  openSection,
  readSessionToken,
  saveAndSettle,
  submitPassword,
  test,
  writeSessionToken,
} from '../lib/user-configs.js';

const PASSWORD = 'correct horse';
const NEW_PASSWORD = 'battery staple';
const THIRD_PASSWORD = 'tissue paper';
const ENGLISH = SubtitleLanguage.label(SubtitleLanguage.ENG);
const STORED_LANGUAGE_CODES = [SubtitleLanguage.TUR];
const INSTALL_TAB = {tab: 'install'};
const SAVE_FIRST_TEXT = 'Save to get your install link.';
const DELETED_TEXT = 'Configuration deleted.';
const DELETE_NOTE = 'Subtitles already stored keep working.';
const USER_CONFIG_PASSWORD_PATH = `${USER_CONFIG_PATH}/password`;

function readClipboard(page) {
  return page.evaluate(() => navigator.clipboard.readText());
}

function getInstallLink(page) {
  return getMain(page).getByRole('link', {
    name: 'Install in Stremio app',
    exact: true,
  });
}

function getWebInstallLink(page) {
  return getMain(page).getByRole('link', {
    name: 'Install in Stremio Web',
    exact: true,
  });
}

function getNuvioInstallLink(page) {
  return getMain(page).getByRole('link', {
    name: 'Install in Nuvio',
    exact: true,
  });
}

function getManifestUrlField(page) {
  return getMain(page).getByRole('textbox', {
    name: 'Addon URL',
    exact: true,
  });
}

function getCopyButton(page) {
  return getMain(page).getByRole('button', {name: 'Copy link', exact: true});
}

function getChangePasswordButton(page) {
  return getMain(page).getByRole('button', {
    name: 'Change password',
    exact: true,
  });
}

function getDeleteButton(page) {
  return getMain(page).getByRole('button', {
    name: 'Delete configuration',
    exact: true,
  });
}

function getDeleteDialog(page) {
  return page.getByRole('alertdialog');
}

async function openSignedIn(page, userConfig) {
  await writeSessionToken(page, userConfig);
  await openConfigure(page, {
    userConfigId: userConfig.userConfigId,
    ...INSTALL_TAB,
  });
}

async function readManifestUrl(request, {userConfigId, sessionToken}) {
  const {manifestUrl} = await callApi(
    request,
    'GET',
    getUserConfigPath(userConfigId),
    {sessionToken},
  );
  return manifestUrl;
}

async function fillChangePassword(page, {currentPassword, newPassword}) {
  const main = getMain(page);
  const currentPasswordField = main.getByLabel('Current password', {
    exact: true,
  });
  await expect(currentPasswordField).toBeVisible();
  await currentPasswordField.fill(currentPassword);
  await main.getByLabel('New password', {exact: true}).fill(newPassword);
  await main.getByLabel('Repeat new password', {exact: true}).fill(newPassword);
}

async function openDeleteDialog(page) {
  const deleteButton = getDeleteButton(page);
  await expect(deleteButton).toBeVisible();
  await deleteButton.click();
  await expect(getDeleteDialog(page)).toBeVisible();
}

async function confirmDelete(page, password) {
  const dialog = getDeleteDialog(page);
  await getPasswordField(dialog).fill(password);
  await dialog
    .getByRole('button', {name: 'Delete configuration', exact: true})
    .click();
}

async function dismissPasswordPrompt(page) {
  const passwordDialog = getPasswordDialog(page);
  await expect(passwordDialog).toBeVisible();
  await passwordDialog
    .getByRole('button', {name: 'Cancel', exact: true})
    .click();
  await expect(passwordDialog).toHaveCount(0);
}

async function expectEntryFlow(page, userConfigId) {
  await expectSearchParams(page).toEqual({});
  await expect(getVisibleText(page, NOT_SAVED_YET_TEXT)).toBeVisible();
  expect(await readSessionToken(page, userConfigId)).toBeNull();
}

test.describe('install', () => {
  test.describe('a new user', () => {
    test('sees only the save hint before the first save', async ({page}) => {
      await openConfigure(page, INSTALL_TAB);

      await expect(getMain(page).getByText(SAVE_FIRST_TEXT)).toBeVisible();
      await expect(getInstallLink(page)).toHaveCount(0);
      await expect(getCopyButton(page)).toHaveCount(0);
      await expect(getChangePasswordButton(page)).toHaveCount(0);
      await expect(getDeleteButton(page)).toHaveCount(0);
    });
  });

  test.describe('the manifest link', () => {
    test('links Stremio to the manifest URL the API returned', async ({
      page,
      request,
      userConfigs,
    }) => {
      const userConfig = await userConfigs.create({
        password: PASSWORD,
        languageCodes: STORED_LANGUAGE_CODES,
      });
      const manifestUrl = new URL(await readManifestUrl(request, userConfig));

      await openSignedIn(page, userConfig);

      const installLink = getInstallLink(page);
      await expect(installLink).toHaveAttribute(
        'href',
        `stremio://${manifestUrl.host}${manifestUrl.pathname}`,
      );
      const href = await installLink.getAttribute('href');
      expect(href.startsWith('stremio://')).toBe(true);
      expect(
        href.endsWith(`/addon/${userConfig.userConfigId}/manifest.json`),
      ).toBe(true);
      await expect(getManifestUrlField(page)).toHaveValue(manifestUrl.href);
      await expect(getManifestUrlField(page)).not.toBeEditable();
      await expect(getMain(page).getByText(SAVE_FIRST_TEXT)).toHaveCount(0);
    });

    test('links Stremio Web to the manifest URL in a new tab', async ({
      page,
      request,
      userConfigs,
    }) => {
      const userConfig = await userConfigs.create({
        password: PASSWORD,
        languageCodes: STORED_LANGUAGE_CODES,
      });
      const manifestUrl = await readManifestUrl(request, userConfig);

      await openSignedIn(page, userConfig);

      const webInstallLink = getWebInstallLink(page);
      await expect(webInstallLink).toHaveAttribute(
        'href',
        `https://web.stremio.com/#/addons?addon=${encodeURIComponent(manifestUrl)}`,
      );
      await expect(webInstallLink).toHaveAttribute('target', '_blank');
    });

    test('links Nuvio to the manifest URL', async ({
      page,
      request,
      userConfigs,
    }) => {
      const userConfig = await userConfigs.create({
        password: PASSWORD,
        languageCodes: STORED_LANGUAGE_CODES,
      });
      const {host, pathname} = new URL(
        await readManifestUrl(request, userConfig),
      );

      await openSignedIn(page, userConfig);

      await expect(getNuvioInstallLink(page)).toHaveAttribute(
        'href',
        `nuvio://${host}${pathname}`,
      );
    });

    test('notes in the delete card that stored subtitles keep working', async ({
      page,
      userConfigs,
    }) => {
      const userConfig = await userConfigs.create({
        password: PASSWORD,
        languageCodes: STORED_LANGUAGE_CODES,
      });

      await openSignedIn(page, userConfig);

      await expect(getMain(page).getByText(DELETE_NOTE)).toBeVisible();
    });

    test('Copy puts the manifest URL on the clipboard and says so', async ({
      page,
      context,
      request,
      userConfigs,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      const userConfig = await userConfigs.create({
        password: PASSWORD,
        languageCodes: STORED_LANGUAGE_CODES,
      });
      const manifestUrl = await readManifestUrl(request, userConfig);
      await openSignedIn(page, userConfig);

      const copyButton = getCopyButton(page);
      await expect(copyButton).toBeVisible();
      await copyButton.click();

      await expectToasts(page, ['Link copied.']);
      expect(await readClipboard(page)).toBe(manifestUrl);
    });
  });

  test.describe('the password change', () => {
    test('keeps the page signed in on a fresh token and lets the new password sign in', async ({
      page,
      browser,
      baseURL,
      userConfigs,
    }) => {
      const userConfig = await userConfigs.create({
        password: PASSWORD,
        languageCodes: STORED_LANGUAGE_CODES,
      });
      const {userConfigId} = userConfig;
      await openSignedIn(page, userConfig);
      await fillChangePassword(page, {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      });

      await getChangePasswordButton(page).click();

      await expectToasts(page, ['Password changed.']);
      userConfigs.setPassword({userConfigId, password: NEW_PASSWORD});
      await expect
        .poll(() => readSessionToken(page, userConfigId))
        .not.toBe(userConfig.sessionToken);
      expect(await readSessionToken(page, userConfigId)).toEqual(
        expect.any(String),
      );
      await openSection(page, 'Languages');
      await addLanguage(page, ENGLISH);
      await saveAndSettle(page, userConfig);
      await expect(getPasswordDialog(page)).toHaveCount(0);
      await page.reload();
      await expect(getLanguage(page, ENGLISH)).toBeVisible();
      await expect(getPasswordField(page)).toHaveCount(0);

      const otherContext = await browser.newContext({baseURL});
      const otherPage = await otherContext.newPage();
      await openConfigure(otherPage, {userConfigId, ...INSTALL_TAB});
      await submitPassword(otherPage, NEW_PASSWORD);
      await expect(getInstallLink(otherPage)).toBeVisible();
      await otherContext.close();
    });

    test('sends a second browser holding the old token back to the password prompt', async ({
      page,
      browser,
      baseURL,
      userConfigs,
    }) => {
      const userConfig = await userConfigs.create({
        password: PASSWORD,
        languageCodes: STORED_LANGUAGE_CODES,
      });
      const {userConfigId} = userConfig;
      await openSignedIn(page, userConfig);
      await fillChangePassword(page, {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      });
      await getChangePasswordButton(page).click();
      await expectToasts(page, ['Password changed.']);
      userConfigs.setPassword({userConfigId, password: NEW_PASSWORD});

      const otherContext = await browser.newContext({baseURL});
      const otherPage = await otherContext.newPage();
      await openSignedIn(otherPage, userConfig);

      await expect(getPasswordField(otherPage)).toBeVisible();
      await expect(getMain(otherPage).getByText(SESSION_REFUSAL)).toBeVisible();
      expect(await readSessionToken(otherPage, userConfigId)).toBeNull();
      await otherContext.close();
    });

    test.describe('with a wrong current password', () => {
      test.use({
        allowedConsoleError: getFailedRequestPattern({
          [USER_CONFIG_PASSWORD_PATH]: [StatusCodes.UNAUTHORIZED],
        }),
      });

      test('shows the refusal and keeps the session and the old password', async ({
        page,
        request,
        userConfigs,
      }) => {
        const userConfig = await userConfigs.create({
          password: PASSWORD,
          languageCodes: STORED_LANGUAGE_CODES,
        });
        const {userConfigId} = userConfig;
        await openSignedIn(page, userConfig);
        await fillChangePassword(page, {
          currentPassword: 'not the password',
          newPassword: NEW_PASSWORD,
        });

        await getChangePasswordButton(page).click();

        await expect(getVisibleText(page, LOGIN_REFUSAL)).toBeVisible();
        expect(await readSessionToken(page, userConfigId)).toBe(
          userConfig.sessionToken,
        );
        await expect(getPasswordDialog(page)).toHaveCount(0);
        await expect(getInstallLink(page)).toBeVisible();
        await callApi(
          request,
          'POST',
          `${getUserConfigPath(userConfigId)}/sessions`,
          {data: {password: PASSWORD}},
        );
      });
    });

    test.describe('after the password prompt was dismissed', () => {
      test.use({
        allowedConsoleError: getFailedRequestPattern({
          [USER_CONFIG_PASSWORD_PATH]: [StatusCodes.UNAUTHORIZED],
        }),
      });

      test('asks for the password again instead of doing nothing', async ({
        page,
        userConfigs,
      }) => {
        const userConfig = await userConfigs.create({
          password: PASSWORD,
          languageCodes: STORED_LANGUAGE_CODES,
        });
        await openSignedIn(page, userConfig);
        await expect(getInstallLink(page)).toBeVisible();
        await userConfigs.changePassword({
          ...userConfig,
          newPassword: NEW_PASSWORD,
        });
        await fillChangePassword(page, {
          currentPassword: NEW_PASSWORD,
          newPassword: THIRD_PASSWORD,
        });
        await getChangePasswordButton(page).click();
        await dismissPasswordPrompt(page);

        await getChangePasswordButton(page).click();

        await expect(getPasswordDialog(page)).toBeVisible();
      });
    });

    test('a repeat that does not match sends nothing', async ({
      page,
      userConfigs,
    }) => {
      const userConfig = await userConfigs.create({
        password: PASSWORD,
        languageCodes: STORED_LANGUAGE_CODES,
      });
      await openSignedIn(page, userConfig);
      const changes = recordRequests(
        page,
        request =>
          request.method() === 'PUT' &&
          request.url() ===
            getApiUrl(`${getUserConfigPath(userConfig.userConfigId)}/password`),
      );
      await fillChangePassword(page, {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      });
      await getMain(page)
        .getByLabel('Repeat new password', {exact: true})
        .fill(`${NEW_PASSWORD}!`);

      await getChangePasswordButton(page).click();

      await expect(
        getMain(page).getByText('Passwords do not match'),
      ).toBeVisible();
      expect(changes).toHaveLength(0);
    });
  });

  test.describe('the deletion', () => {
    test.describe('with a wrong password', () => {
      test.use({
        allowedConsoleError: getFailedRequestPattern({
          [USER_CONFIG_PATH]: [StatusCodes.UNAUTHORIZED],
        }),
      });

      test('a wrong password shows the refusal and leaves the configuration and the session intact', async ({
        page,
        request,
        userConfigs,
      }) => {
        const userConfig = await userConfigs.create({
          password: PASSWORD,
          languageCodes: STORED_LANGUAGE_CODES,
        });
        const {userConfigId} = userConfig;
        await openSignedIn(page, userConfig);
        await openDeleteDialog(page);
        await expect(
          getDeleteDialog(page).getByText(DELETE_NOTE),
        ).toBeVisible();

        await confirmDelete(page, 'not the password');

        await expect(getVisibleText(page, LOGIN_REFUSAL)).toBeVisible();
        expect(await readSessionToken(page, userConfigId)).toBe(
          userConfig.sessionToken,
        );
        await expect(getPasswordDialog(page)).toHaveCount(0);
        await expectSearchParams(page).toMatchObject({userConfigId});
        await callApi(request, 'GET', getUserConfigPath(userConfigId), {
          sessionToken: userConfig.sessionToken,
        });
      });
    });

    test.describe('with the right password', () => {
      test.use({
        allowedConsoleError: getFailedRequestPattern({
          [USER_CONFIG_SESSIONS_PATH]: [StatusCodes.UNAUTHORIZED],
        }),
      });

      test('the right password deletes it, clears the session and returns to the entry flow', async ({
        page,
        userConfigs,
      }) => {
        const userConfig = await userConfigs.create({
          password: PASSWORD,
          languageCodes: STORED_LANGUAGE_CODES,
        });
        const {userConfigId} = userConfig;
        await openSignedIn(page, userConfig);
        await openDeleteDialog(page);

        await confirmDelete(page, PASSWORD);

        await expect(getVisibleText(page, DELETED_TEXT)).toBeVisible();
        userConfigs.forget(userConfigId);
        await expectEntryFlow(page, userConfigId);
        await page
          .getByRole('link', {name: 'I already have a configuration'})
          .click();
        await getConfigurationIdField(page).fill(userConfigId);
        await submitPassword(page, PASSWORD);
        await expect(getMain(page).getByText(LOGIN_REFUSAL)).toBeVisible();
      });
    });

    test.describe('after the password prompt was dismissed', () => {
      test.use({
        allowedConsoleError: getFailedRequestPattern({
          [USER_CONFIG_PATH]: [StatusCodes.UNAUTHORIZED],
        }),
      });

      test('asks for the password again instead of doing nothing', async ({
        page,
        userConfigs,
      }) => {
        const userConfig = await userConfigs.create({
          password: PASSWORD,
          languageCodes: STORED_LANGUAGE_CODES,
        });
        await openSignedIn(page, userConfig);
        await expect(getInstallLink(page)).toBeVisible();
        await userConfigs.changePassword({
          ...userConfig,
          newPassword: NEW_PASSWORD,
        });
        await openDeleteDialog(page);
        await confirmDelete(page, NEW_PASSWORD);
        await dismissPasswordPrompt(page);

        await openDeleteDialog(page);
        await confirmDelete(page, NEW_PASSWORD);

        await expect(getPasswordDialog(page)).toBeVisible();
        await expect(getDeleteDialog(page)).toHaveCount(0);
      });
    });

    test('a configuration already gone still ends in the entry flow', async ({
      page,
      userConfigs,
    }) => {
      const userConfig = await userConfigs.create({
        password: PASSWORD,
        languageCodes: STORED_LANGUAGE_CODES,
      });
      const {userConfigId} = userConfig;
      await openSignedIn(page, userConfig);
      await openDeleteDialog(page);
      await userConfigs.remove(userConfigId);

      await confirmDelete(page, PASSWORD);

      await expect(getVisibleText(page, DELETED_TEXT)).toBeVisible();
      await expectEntryFlow(page, userConfigId);
    });
  });
});
