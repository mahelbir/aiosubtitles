import {StatusCodes} from 'http-status-codes';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {ErrorCode} from '@repo/shared/constants/error-code.js';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {THESUBTITLEDB_VALID_API_KEY} from '../../../../api/tests/e2e/fixture-credentials.js';
import {
  getApiUrl,
  getErrorEnvelope,
  getFailedRequestPattern,
} from '../lib/api.js';
import {getMain, getOfflineBanner, getVisibleText} from '../lib/locators.js';
import {expectSearchParams} from '../lib/page.js';
import {recordRequests} from '../lib/requests.js';
import {
  LOGIN_REFUSAL,
  MANIFEST_URL_PATTERN,
  NOT_SAVED_YET_TEXT,
  SAVED_TEXT,
  SESSION_REFUSAL,
  USER_CONFIG_PATH,
  USER_CONFIG_SESSIONS_PATH,
  addLanguage,
  callApi,
  expect,
  getAllSourcesCheckbox,
  getConfigurationIdField,
  getLanguage,
  getPasswordDialog,
  getPasswordField,
  getSetPasswordDialog,
  getUnsavedNotice,
  getUserConfigPath,
  getVisibleSaveButton,
  openConfigure,
  openSection,
  openSignedIn,
  readSessionToken,
  saveAndSettle,
  submitPassword,
  test,
} from '../lib/user-configs.js';
import {
  PHONE_VIEWPORT,
  TALL_PHONE_VIEWPORT,
  isPhoneLayout,
} from '../lib/viewport.js';

const PASSWORD = 'correct horse';
const NEW_PASSWORD = 'battery staple';
const TURKISH = SubtitleLanguage.label(SubtitleLanguage.TUR);
const ENGLISH = SubtitleLanguage.label(SubtitleLanguage.ENG);
const STORED_LANGUAGE_CODES = [SubtitleLanguage.TUR];

function readFixedAncestorTop(locator) {
  return locator.evaluate(node => {
    let element = node;
    while (element && getComputedStyle(element).position !== 'fixed') {
      element = element.parentElement;
    }
    return element.getBoundingClientRect().top;
  });
}

function refuseNextSave(page, userConfigId) {
  let isRefused = false;
  return page.route(getApiUrl(getUserConfigPath(userConfigId)), route => {
    if (route.request().method() !== 'PATCH' || isRefused) {
      return route.fallback();
    }
    isRefused = true;
    return route.fulfill({
      status: StatusCodes.UNAUTHORIZED,
      json: getErrorEnvelope(SESSION_REFUSAL, ErrorCode.SESSION_EXPIRED),
    });
  });
}

async function expectSavedAfterPassword(page, {userConfigId, password}) {
  const passwordDialog = getPasswordDialog(page);
  await expect(passwordDialog).toBeVisible();
  await expect(passwordDialog.getByText(SESSION_REFUSAL)).toBeVisible();
  expect(await readSessionToken(page, userConfigId)).toBeNull();
  const save = page.waitForResponse(
    response =>
      response.request().method() === 'PATCH' &&
      response.url() === getApiUrl(getUserConfigPath(userConfigId)) &&
      response.ok(),
  );

  await submitPassword(passwordDialog, password);

  await save;
  await expect(passwordDialog).toHaveCount(0);
  await expect(getLanguage(page, ENGLISH)).toBeVisible();
  await expect(getVisibleText(page, SAVED_TEXT)).toBeVisible();
  expect(await readSessionToken(page, userConfigId)).toEqual(
    expect.any(String),
  );
}

test.describe('configure', () => {
  test.describe('a new user', () => {
    test('shows a new form that is not saved yet, in one main landmark', async ({
      page,
    }) => {
      await openConfigure(page);

      await expect(getMain(page)).toHaveCount(1);
      await expect(getVisibleText(page, NOT_SAVED_YET_TEXT)).toBeVisible();
      await expect(getVisibleText(page, SAVED_TEXT)).toHaveCount(0);
      await expect(getPasswordField(page)).toHaveCount(0);
    });

    test('saves a first configuration behind a password and lands on its install link', async ({
      page,
      userConfigs,
    }) => {
      await openConfigure(page);
      await openSection(page, 'Languages');
      await expectSearchParams(page).toEqual({tab: 'languages'});
      await addLanguage(page, TURKISH);
      await expect(getUnsavedNotice(page)).toBeVisible();

      await getVisibleSaveButton(page).click();
      const dialog = getSetPasswordDialog(page);
      await expect(dialog).toBeVisible();
      await getPasswordField(dialog).fill(PASSWORD);
      await dialog
        .getByLabel('Repeat password', {exact: true})
        .fill(`${PASSWORD}!`);
      await dialog.getByLabel('Repeat password', {exact: true}).press('Enter');
      await expect(dialog.getByText('Passwords do not match')).toBeVisible();
      await dialog.getByLabel('Repeat password', {exact: true}).fill(PASSWORD);
      await dialog.getByLabel('Repeat password', {exact: true}).press('Enter');

      await expect(dialog).toHaveCount(0);
      await expect(page).toHaveURL(/[?&]userConfigId=[0-9a-f-]{36}/);
      const userConfigId = new URL(page.url()).searchParams.get('userConfigId');
      userConfigs.track({userConfigId, password: PASSWORD});
      await expectSearchParams(page).toEqual({userConfigId, tab: 'install'});
      await expect(getMain(page).getByText(MANIFEST_URL_PATTERN)).toContainText(
        `/${userConfigId}/manifest.json`,
      );
      await expect(getVisibleText(page, SAVED_TEXT)).toBeVisible();
      await expect(getVisibleText(page, NOT_SAVED_YET_TEXT)).toHaveCount(0);
      expect(await readSessionToken(page, userConfigId)).toEqual(
        expect.any(String),
      );
    });

    test('a save without a language opens Languages with its error and asks for no password', async ({
      page,
    }) => {
      await openConfigure(page);
      if (isPhoneLayout(page)) {
        await getAllSourcesCheckbox(page).click();
      }

      await getVisibleSaveButton(page).click();

      await expectSearchParams(page).toEqual({tab: 'languages'});
      await expect(
        getMain(page).getByText('Choose at least one language'),
      ).toBeVisible();
      await expect(getSetPasswordDialog(page)).toHaveCount(0);
    });

    test('"I already have a configuration" opens the card for an id and a password', async ({
      page,
      userConfigs,
    }) => {
      const userConfig = await userConfigs.create({
        password: PASSWORD,
        languageCodes: STORED_LANGUAGE_CODES,
      });
      await openConfigure(page);

      await page
        .getByRole('link', {name: 'I already have a configuration'})
        .click();
      const idField = getConfigurationIdField(page);
      await expect(idField).toBeEditable();
      await idField.fill(userConfig.userConfigId);
      await submitPassword(page, PASSWORD);

      await expectSearchParams(page).toMatchObject({
        userConfigId: userConfig.userConfigId,
      });
      await openSection(page, 'Languages');
      await expect(getLanguage(page, TURKISH)).toBeVisible();
    });
  });

  test.describe('a returning user', () => {
    test.use({
      allowedConsoleError: getFailedRequestPattern({
        [USER_CONFIG_SESSIONS_PATH]: [StatusCodes.UNAUTHORIZED],
      }),
    });

    test('comes from the addon link to a sign-in card and loads the stored config with the right password', async ({
      page,
      request,
      userConfigs,
    }) => {
      const {userConfigId} = await userConfigs.create({
        password: PASSWORD,
        languageCodes: STORED_LANGUAGE_CODES,
      });
      const redirect = await request.get(
        getApiUrl(`/${userConfigId}/configure`),
        {maxRedirects: 0},
      );
      expect(redirect.status()).toBe(StatusCodes.MOVED_TEMPORARILY);
      const location = redirect.headers().location;
      expect(location).toMatch(
        new RegExp(`/configure\\?userConfigId=${userConfigId}$`),
      );

      await page.goto(location.slice(location.indexOf('/configure')));

      const idField = getConfigurationIdField(page);
      await expect(idField).toHaveValue(userConfigId);
      await expect(idField).not.toBeEditable();
      await submitPassword(page, 'not the password');
      await expect(getMain(page).getByText(LOGIN_REFUSAL)).toBeVisible();
      expect(await readSessionToken(page, userConfigId)).toBeNull();

      await submitPassword(page, PASSWORD);

      await expect(idField).toHaveCount(0);
      await openSection(page, 'Languages');
      await expect(getLanguage(page, TURKISH)).toBeVisible();
      expect(await readSessionToken(page, userConfigId)).toEqual(
        expect.any(String),
      );
    });
  });

  test.describe('a broken link', () => {
    test('an id that is not a configuration ID still offers a new configuration', async ({
      page,
    }) => {
      await openConfigure(page, {userConfigId: 'not-an-id'});
      await expect(getConfigurationIdField(page)).toHaveValue('not-an-id');

      await page
        .getByRole('link', {name: 'Create a new configuration', exact: true})
        .click();

      await expectSearchParams(page).toEqual({});
      await expect(getVisibleText(page, NOT_SAVED_YET_TEXT)).toBeVisible();
    });
  });

  test.describe('a stored session', () => {
    test('opens the loaded form at once and keeps the section in the URL', async ({
      page,
      userConfigs,
    }) => {
      const userConfig = await userConfigs.create({
        password: PASSWORD,
        languageCodes: STORED_LANGUAGE_CODES,
      });

      await openSignedIn(page, userConfig, {tab: 'languages'});

      await expect(getLanguage(page, TURKISH)).toBeVisible();
      await expect(getPasswordField(page)).toHaveCount(0);
      await expect(getVisibleText(page, SAVED_TEXT)).toBeVisible();
      await openSection(page, 'Install');
      await expectSearchParams(page).toEqual({
        userConfigId: userConfig.userConfigId,
        tab: 'install',
      });
      await expect(getUnsavedNotice(page)).toHaveCount(0);
    });
  });

  test.describe('an expired session', () => {
    test.use({
      allowedConsoleError: getFailedRequestPattern({
        [USER_CONFIG_PATH]: [StatusCodes.UNAUTHORIZED],
      }),
    });

    test('a refused save asks for the password, keeps the edit and saves once signed in again', async ({
      page,
      userConfigs,
    }) => {
      const userConfig = await userConfigs.create({
        password: PASSWORD,
        languageCodes: STORED_LANGUAGE_CODES,
      });
      await openSignedIn(page, userConfig, {tab: 'languages'});
      await addLanguage(page, ENGLISH);
      await refuseNextSave(page, userConfig.userConfigId);

      await getVisibleSaveButton(page).click();

      await expectSavedAfterPassword(page, userConfig);
    });

    test('a save after the password dialog is closed asks again without sending a request', async ({
      page,
      userConfigs,
    }) => {
      const userConfig = await userConfigs.create({
        password: PASSWORD,
        languageCodes: STORED_LANGUAGE_CODES,
      });
      await openSignedIn(page, userConfig, {tab: 'languages'});
      await addLanguage(page, ENGLISH);
      await refuseNextSave(page, userConfig.userConfigId);
      const saves = recordRequests(
        page,
        request =>
          request.method() === 'PATCH' &&
          request.url() ===
            getApiUrl(getUserConfigPath(userConfig.userConfigId)),
      );
      await getVisibleSaveButton(page).click();
      const passwordDialog = getPasswordDialog(page);
      await expect(passwordDialog).toBeVisible();
      await passwordDialog
        .getByRole('button', {name: 'Cancel', exact: true})
        .click();
      await expect(passwordDialog).toHaveCount(0);
      await expect(getLanguage(page, ENGLISH)).toBeVisible();

      await getVisibleSaveButton(page).click();

      await expect(passwordDialog).toBeVisible();
      expect(saves).toHaveLength(1);
    });

    test('a password changed elsewhere ends the open session, and the new password saves the kept edit', async ({
      page,
      userConfigs,
    }) => {
      const userConfig = await userConfigs.create({
        password: PASSWORD,
        languageCodes: STORED_LANGUAGE_CODES,
      });
      await openSignedIn(page, userConfig, {tab: 'languages'});
      await addLanguage(page, ENGLISH);
      await userConfigs.changePassword({
        ...userConfig,
        newPassword: NEW_PASSWORD,
      });

      await getVisibleSaveButton(page).click();

      await expectSavedAfterPassword(page, {
        userConfigId: userConfig.userConfigId,
        password: NEW_PASSWORD,
      });
    });

    test('a stale stored token asks for the password again on load', async ({
      page,
      userConfigs,
    }) => {
      const userConfig = await userConfigs.create({
        password: PASSWORD,
        languageCodes: STORED_LANGUAGE_CODES,
      });
      await userConfigs.changePassword({
        ...userConfig,
        newPassword: NEW_PASSWORD,
      });

      await openSignedIn(page, userConfig, {tab: 'languages'});

      await expect(getPasswordField(page)).toBeVisible();
      await expect(getMain(page).getByText(SESSION_REFUSAL)).toBeVisible();
      expect(await readSessionToken(page, userConfig.userConfigId)).toBeNull();
      await submitPassword(page, NEW_PASSWORD);
      await expect(getLanguage(page, TURKISH)).toBeVisible();
      expect(await readSessionToken(page, userConfig.userConfigId)).not.toBe(
        userConfig.sessionToken,
      );
    });
  });

  for (const viewport of [PHONE_VIEWPORT, TALL_PHONE_VIEWPORT]) {
    test.describe(`on a phone ${viewport.width} wide`, () => {
      test.use({viewport});
      test.skip(
        ({isMobile}) => !isMobile,
        'The phone profile runs the save bar checks.',
      );

      test('the offline banner never covers the save bar', async ({
        page,
        context,
        userConfigs,
      }) => {
        const userConfig = await userConfigs.create({
          password: PASSWORD,
          languageCodes: STORED_LANGUAGE_CODES,
        });
        await openSignedIn(page, userConfig, {tab: 'languages'});
        await addLanguage(page, ENGLISH);
        const saveButton = getVisibleSaveButton(page);
        await expect(saveButton).toBeVisible();

        await context.setOffline(true);

        const banner = getOfflineBanner(page);
        await expect(banner).toBeInViewport();
        await expect(saveButton).toBeInViewport();
        const [bannerBox, saveBarTop] = await Promise.all([
          banner.boundingBox(),
          readFixedAncestorTop(getUnsavedNotice(page)),
        ]);
        expect(bannerBox.y + bannerBox.height).toBeLessThanOrEqual(saveBarTop);
        await context.setOffline(false);
      });
    });
  }

  test.describe('a stored secret', () => {
    test('an untouched stored key is sent blank beside its credentialId', async ({
      page,
      request,
      userConfigs,
    }) => {
      const userConfig = await userConfigs.create({
        password: PASSWORD,
        languageCodes: STORED_LANGUAGE_CODES,
        credentials: [
          {
            subtitleSource: SubtitleSource.THESUBTITLEDB,
            credentialKind: CredentialKind.API_KEY,
            credentialSecret: {apiKey: THESUBTITLEDB_VALID_API_KEY},
          },
        ],
      });
      const {credentials: storedCredentials} = await callApi(
        request,
        'GET',
        getUserConfigPath(userConfig.userConfigId),
        {sessionToken: userConfig.sessionToken},
      );
      expect(storedCredentials).toMatchObject([
        {credentialStatus: CredentialStatus.VALID},
      ]);
      await openSignedIn(page, userConfig, {tab: 'languages'});
      await addLanguage(page, ENGLISH);

      const patch = await saveAndSettle(page, userConfig);

      const [credential] = patch.postDataJSON().credentials;
      expect(credential).toMatchObject({
        credentialId: storedCredentials[0].credentialId,
        credentialSecret: {apiKey: ''},
      });
    });
  });
});
