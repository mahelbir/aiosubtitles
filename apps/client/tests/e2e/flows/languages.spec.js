import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {
  SUBTITLE_LANGUAGE_LIMIT_DEFAULT,
  USER_CONFIG_LANGUAGE_CODES_MAX,
} from '@repo/shared/constants/user-config.js';
import {getField, getMain} from '../lib/locators.js';
import {
  addLanguage,
  callApi,
  expect,
  getAddLanguageButton,
  getLabelPattern,
  getLanguageOption,
  getLanguagePickers,
  getPasswordField,
  getSetPasswordDialog,
  getUserConfigPath,
  getVisibleSaveButton,
  openConfigure,
  openNextLanguagePicker,
  openSection,
  openSignedIn,
  readSessionToken,
  test,
} from '../lib/user-configs.js';

const PASSWORD = 'correct horse';
const TURKISH = SubtitleLanguage.label(SubtitleLanguage.TUR);
const TURKISH_NATIVE_NAME = SubtitleLanguage.raw(
  SubtitleLanguage.TUR,
).nativeName;
const TURKMEN = SubtitleLanguage.label(SubtitleLanguage.TUK);
const ENGLISH = SubtitleLanguage.label(SubtitleLanguage.ENG);
const LIMIT_LABEL = 'Subtitles per language';

function getLanguageOrder(...labels) {
  return labels.map(getLabelPattern);
}

async function createFromNewForm(page, userConfigs) {
  await getVisibleSaveButton(page).click();
  const dialog = getSetPasswordDialog(page);
  await getPasswordField(dialog).fill(PASSWORD);
  const repeat = dialog.getByLabel('Repeat password', {exact: true});
  await repeat.fill(PASSWORD);
  await repeat.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/[?&]userConfigId=[0-9a-f-]{36}/);
  const userConfigId = new URL(page.url()).searchParams.get('userConfigId');
  userConfigs.track({userConfigId, password: PASSWORD});
  return userConfigId;
}

test.describe('languages', () => {
  test('keeps the order set before a save after a reload', async ({
    page,
    request,
    userConfigs,
  }) => {
    await openConfigure(page, {tab: 'languages'});
    await addLanguage(page, TURKISH);
    await addLanguage(page, ENGLISH);

    await getMain(page)
      .getByRole('button', {name: 'Move up', exact: true})
      .nth(1)
      .click();
    await expect(getLanguagePickers(page)).toHaveText(
      getLanguageOrder(ENGLISH, TURKISH),
    );
    const userConfigId = await createFromNewForm(page, userConfigs);

    await page.reload();
    await openSection(page, 'Languages');

    await expect(getLanguagePickers(page)).toHaveText(
      getLanguageOrder(ENGLISH, TURKISH),
    );
    const sessionToken = await readSessionToken(page, userConfigId);
    const {languageCodes} = await callApi(
      request,
      'GET',
      getUserConfigPath(userConfigId),
      {sessionToken},
    );
    expect(languageCodes).toEqual([SubtitleLanguage.ENG, SubtitleLanguage.TUR]);
  });

  test('disables adding a language once the list holds ten', async ({
    page,
    userConfigs,
  }) => {
    const userConfig = await userConfigs.create({
      password: PASSWORD,
      languageCodes: SubtitleLanguage.values.slice(
        0,
        USER_CONFIG_LANGUAGE_CODES_MAX,
      ),
    });

    await openSignedIn(page, userConfig, {tab: 'languages'});

    await expect(getLanguagePickers(page)).toHaveCount(
      USER_CONFIG_LANGUAGE_CODES_MAX,
    );
    await expect(getAddLanguageButton(page)).toBeDisabled();
  });

  test('shows the range message for 31 subtitles per language', async ({
    page,
  }) => {
    await openConfigure(page, {tab: 'languages'});
    const limit = getField(getMain(page), LIMIT_LABEL);
    await expect(limit).toHaveValue(String(SUBTITLE_LANGUAGE_LIMIT_DEFAULT));

    await limit.fill('31');
    await limit.press('Tab');

    await expect(
      getMain(page).getByText(
        'Subtitles per language must be between 1 and 30',
      ),
    ).toBeVisible();
  });

  test('does not offer a chosen language in the next picker', async ({
    page,
  }) => {
    await openConfigure(page, {tab: 'languages'});
    await addLanguage(page, TURKISH);

    await openNextLanguagePicker(page, 'Turk');

    await expect(getLanguageOption(page, TURKMEN)).toBeVisible();
    await expect(getLanguageOption(page, TURKISH)).toHaveCount(0);
  });

  test('shows the native name beside each language option', async ({page}) => {
    await openConfigure(page, {tab: 'languages'});

    await openNextLanguagePicker(page, TURKISH);

    await expect(getLanguageOption(page, TURKISH)).toContainText(
      TURKISH_NATIVE_NAME,
    );
  });

  test('shows a native name equal to its label once', async ({page}) => {
    await openConfigure(page, {tab: 'languages'});

    await openNextLanguagePicker(page, ENGLISH);

    await expect(getLanguageOption(page, ENGLISH)).toHaveAccessibleName(
      ENGLISH,
    );
  });
});
