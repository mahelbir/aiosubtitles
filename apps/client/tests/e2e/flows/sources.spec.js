import {StatusCodes} from 'http-status-codes';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  OPENSUBTITLES_STALE_QUOTA_ACCOUNT,
  OPENSUBTITLES_VALID_ACCOUNT,
  THESUBTITLEDB_LATE_API_KEY_PREFIX,
  THESUBTITLEDB_VALID_API_KEY,
} from '../../../../api/tests/e2e/fixture-credentials.js';
import {
  getApiUrl,
  getFailedRequestPattern,
  getValidationEnvelope,
} from '../lib/api.js';
import {getTabPanel} from '../lib/locators.js';
import {holdRequest} from '../lib/requests.js';
import {
  openTabMenuItem,
  openTabMenuItems,
  readTokenColor,
} from '../lib/page.js';
import {
  USER_CONFIG_PATH,
  callApi,
  expect,
  getAllSourcesCheckbox,
  getUnsavedNotice,
  getUserConfigPath,
  getVisibleSaveButton,
  openConfigure,
  openSignedIn,
  saveAndSettle,
  test,
} from '../lib/user-configs.js';

const PASSWORD = 'correct horse';
const STORED_LANGUAGE_CODES = [SubtitleLanguage.TUR];
const SUBTITLE_SOURCES_PATH = '/api/subtitle-sources';
const GET_A_KEY = 'Get a key';
const ADD_API_KEY = 'Add API key';
const API_KEY = CredentialKind.label(CredentialKind.API_KEY);
const REJECTED_API_KEY = 'sdb_rejected_fixture';
const REJECTED_ACCOUNT = {username: 'rejected-user', password: 'rejected-pass'};
const CHECK_AGAIN = 'Check again';
const STORED_SECRET_MESSAGE = 'Enter both the username and the password.';
const QUOTA_TOTAL_PATTERN = /downloads? left today in total$/;
const OPENSUBTITLES = SubtitleSource.label(SubtitleSource.OPENSUBTITLES);
const OPENSUBTITLES_V3 = SubtitleSource.label(SubtitleSource.OPENSUBTITLES_V3);
const THESUBTITLEDB = SubtitleSource.label(SubtitleSource.THESUBTITLEDB);
const SUBSOURCE = SubtitleSource.label(SubtitleSource.SUBSOURCE);

const SOURCE_HELP = [
  {
    subtitleSource: SubtitleSource.OPENSUBTITLES,
    keyPageUrl: 'https://www.opensubtitles.com/',
    helpText:
      "Uses the server's app key. Add your OpenSubtitles account to download on your own quota: free accounts get 20 downloads a day, VIP accounts 1000. Listing results costs nothing.",
  },
  {
    subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
    keyPageUrl: null,
    helpText: 'No key needed.',
  },
  {
    subtitleSource: SubtitleSource.ALTYAZIDB,
    keyPageUrl: 'https://altyazidb.com/index.php?do=register',
    helpText:
      'Requires an API key. Too many requests return a temporary block.',
  },
  {
    subtitleSource: SubtitleSource.THESUBTITLEDB,
    keyPageUrl: 'https://thesubtitledb.org/account/keys',
    helpText:
      'Requires an API key. With your key, you get 100,000 downloads a day of your own.',
  },
  {
    subtitleSource: SubtitleSource.SUBSOURCE,
    keyPageUrl: 'https://subsource.net/dashboard/api',
    helpText: 'Requires an API key.',
  },
  {
    subtitleSource: SubtitleSource.SUBDL,
    keyPageUrl: 'https://subdl.com/panel/api',
    helpText: 'Requires an API key.',
  },
  {
    subtitleSource: SubtitleSource.BETASERIES,
    keyPageUrl: 'https://www.betaseries.com/compte/api',
    helpText: 'Requires an API key.',
  },
  {
    subtitleSource: SubtitleSource.ANISUB,
    keyPageUrl: 'https://anisub.co/ayarlar',
    helpText:
      'Requires a token. With your token, you get 1000 requests a day of your own.',
  },
  {
    subtitleSource: SubtitleSource.GESTDOWN,
    keyPageUrl: null,
    helpText: "No key needed. Requests share the server's limits.",
  },
  {
    subtitleSource: SubtitleSource.YIFY,
    keyPageUrl: null,
    helpText: "No key needed. Requests share the server's limits.",
  },
  {
    subtitleSource: SubtitleSource.WYZIE,
    keyPageUrl: 'https://sub.wyzie.io/redeem',
    helpText: 'Requires an API key.',
  },
  {
    subtitleSource: SubtitleSource.TVSUBTITLES,
    keyPageUrl: null,
    helpText: "No key needed. Requests share the server's limits.",
  },
  {
    subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
    keyPageUrl: 'https://stremio-community-subtitles.top/configure',
    helpText:
      'Requires your own token. Sign in, copy your install link, and paste it — the page accepts either the whole link or just the token and keeps only the token.',
  },
  {
    subtitleSource: SubtitleSource.JIMAKU,
    keyPageUrl: 'https://jimaku.cc/account',
    helpText: 'Requires an API key.',
  },
  {
    subtitleSource: SubtitleSource.ANIMETOSHO,
    keyPageUrl: null,
    helpText: "No key needed. Requests share the server's limits.",
  },
];

function getSourceSwitch(panel, label) {
  return panel.getByRole('switch', {name: label, exact: true});
}

test.describe('sources', () => {
  test('lists one tab per registered source, in the order the API gives', async ({
    page,
    request,
  }) => {
    const subtitleSources = await callApi(
      request,
      'GET',
      SUBTITLE_SOURCES_PATH,
    );

    await openConfigure(page);

    await expect(await openTabMenuItems(page)).toHaveText(
      subtitleSources.map(({label}) => label),
    );
  });

  test('every source tab shows its help text and its key page link', async ({
    page,
  }) => {
    await openConfigure(page);

    for (const {subtitleSource, keyPageUrl, helpText} of SOURCE_HELP) {
      const label = SubtitleSource.label(subtitleSource);
      const panel = await openTabMenuItem(page, label);
      await expect(panel, label).toContainText(helpText);
      const keyPageLink = panel.getByRole('link', {
        name: GET_A_KEY,
        exact: true,
      });
      if (keyPageUrl) {
        await expect(keyPageLink, label).toHaveAttribute('href', keyPageUrl);
      } else {
        await expect(keyPageLink, label).toHaveCount(0);
      }
    }
  });

  test('the global control reads mixed once one source is switched off, and turns every source on again', async ({
    page,
  }) => {
    await openConfigure(page);
    const allSources = getAllSourcesCheckbox(page);
    await expect(allSources).toBeChecked();
    const panel = await openTabMenuItem(page, OPENSUBTITLES_V3);
    const sourceSwitch = getSourceSwitch(panel, OPENSUBTITLES_V3);
    await expect(sourceSwitch).toBeChecked();

    await sourceSwitch.click();

    await expect(sourceSwitch).not.toBeChecked();
    await expect(allSources).toBeChecked({indeterminate: true});

    await allSources.click();

    await expect(allSources).toBeChecked();
    await expect(sourceSwitch).toBeChecked();
  });

  test('the global control turns every source off from on', async ({page}) => {
    await openConfigure(page);
    const allSources = getAllSourcesCheckbox(page);
    await expect(allSources).toBeChecked();

    await allSources.click();

    await expect(allSources).not.toBeChecked();
    for (const label of [OPENSUBTITLES, THESUBTITLEDB]) {
      const panel = await openTabMenuItem(page, label);
      await expect(getSourceSwitch(panel, label), label).not.toBeChecked();
    }
  });

  test('a saved TheSubtitleDB key locks its switch on', async ({
    page,
    userConfigs,
  }) => {
    const userConfig = await userConfigs.create({
      password: PASSWORD,
      languageCodes: STORED_LANGUAGE_CODES,
    });
    await openSignedIn(page, userConfig);
    const panel = await openTabMenuItem(page, THESUBTITLEDB);
    const sourceSwitch = getSourceSwitch(panel, THESUBTITLEDB);
    await expect(sourceSwitch).toBeEnabled();

    await panel.getByRole('button', {name: ADD_API_KEY, exact: true}).click();
    const apiKeyField = panel.getByLabel(API_KEY, {exact: true});
    await expect(apiKeyField).toHaveAttribute('type', 'password');
    await apiKeyField.fill(THESUBTITLEDB_VALID_API_KEY);
    await saveAndSettle(page, userConfig);
    await page.reload();

    const reloadedPanel = await openTabMenuItem(page, THESUBTITLEDB);
    const reloadedSwitch = getSourceSwitch(reloadedPanel, THESUBTITLEDB);
    await expect(reloadedSwitch).toBeChecked();
    await expect(reloadedSwitch).toBeDisabled();
    await expect(
      reloadedPanel.getByText(CredentialStatus.label(CredentialStatus.VALID), {
        exact: true,
      }),
    ).toBeVisible();
  });

  test('a row added and removed again leaves a switched-off source off', async ({
    page,
    userConfigs,
  }) => {
    const userConfig = await userConfigs.create({
      password: PASSWORD,
      languageCodes: STORED_LANGUAGE_CODES,
    });
    await openSignedIn(page, userConfig);
    const panel = await openTabMenuItem(page, THESUBTITLEDB);
    const sourceSwitch = getSourceSwitch(panel, THESUBTITLEDB);
    await sourceSwitch.click();
    await expect(sourceSwitch).not.toBeChecked();

    await panel.getByRole('button', {name: ADD_API_KEY, exact: true}).click();
    await expect(sourceSwitch).toBeChecked();
    await panel.getByRole('button', {name: 'Remove', exact: true}).click();

    await expect(sourceSwitch).not.toBeChecked();
    await expect(sourceSwitch).toBeEnabled();
    const patch = await saveAndSettle(page, userConfig);
    expect(patch.postDataJSON().subtitleSourceSwitchStates).toMatchObject({
      [SubtitleSource.THESUBTITLEDB]: false,
    });
  });

  test('a failed save leaves a switched-off source off once its blank row is removed', async ({
    page,
    userConfigs,
  }) => {
    const userConfig = await userConfigs.create({
      password: PASSWORD,
      languageCodes: STORED_LANGUAGE_CODES,
    });
    await openSignedIn(page, userConfig);
    const panel = await openTabMenuItem(page, THESUBTITLEDB);
    const sourceSwitch = getSourceSwitch(panel, THESUBTITLEDB);
    await sourceSwitch.click();
    await panel.getByRole('button', {name: ADD_API_KEY, exact: true}).click();

    await getVisibleSaveButton(page).click();

    const apiKeyField = panel.getByLabel(API_KEY, {exact: true});
    await expect(apiKeyField).toHaveAttribute('aria-invalid', 'true');
    await panel.getByRole('button', {name: 'Remove', exact: true}).click();
    await expect(apiKeyField).toHaveCount(0);
    await expect(sourceSwitch).not.toBeChecked();
    await expect(sourceSwitch).toBeEnabled();
  });

  test('a key saved on a switched-off source sends the source on', async ({
    page,
    userConfigs,
  }) => {
    const userConfig = await userConfigs.create({
      password: PASSWORD,
      languageCodes: STORED_LANGUAGE_CODES,
    });
    await openSignedIn(page, userConfig);
    const panel = await openTabMenuItem(page, THESUBTITLEDB);
    await getSourceSwitch(panel, THESUBTITLEDB).click();
    await panel.getByRole('button', {name: ADD_API_KEY, exact: true}).click();
    await panel
      .getByLabel(API_KEY, {exact: true})
      .fill(THESUBTITLEDB_VALID_API_KEY);

    const patch = await saveAndSettle(page, userConfig);

    expect(patch.postDataJSON().subtitleSourceSwitchStates).toMatchObject({
      [SubtitleSource.THESUBTITLEDB]: true,
    });
  });

  test('Check again re-checks a key the first check missed', async ({
    page,
    userConfigs,
  }) => {
    const userConfig = await userConfigs.create({
      password: PASSWORD,
      languageCodes: STORED_LANGUAGE_CODES,
      credentials: [
        {
          subtitleSource: SubtitleSource.THESUBTITLEDB,
          credentialKind: CredentialKind.API_KEY,
          credentialSecret: {
            apiKey: `${THESUBTITLEDB_LATE_API_KEY_PREFIX}${crypto.randomUUID()}`,
          },
        },
      ],
    });
    await openSignedIn(page, userConfig);
    const panel = await openTabMenuItem(page, THESUBTITLEDB);
    await expect(
      panel.getByText(CredentialStatus.label(CredentialStatus.UNCHECKED), {
        exact: true,
      }),
    ).toBeVisible();
    const checkAgain = panel.getByRole('button', {
      name: CHECK_AGAIN,
      exact: true,
    });

    await checkAgain.click();

    await expect(
      panel.getByText(CredentialStatus.label(CredentialStatus.VALID), {
        exact: true,
      }),
    ).toBeVisible();
    await expect(checkAgain).toHaveCount(0);
  });

  test('Check again stays disabled while a save is on its way', async ({
    page,
    userConfigs,
  }) => {
    const userConfig = await userConfigs.create({
      password: PASSWORD,
      languageCodes: STORED_LANGUAGE_CODES,
      credentials: [
        {
          subtitleSource: SubtitleSource.THESUBTITLEDB,
          credentialKind: CredentialKind.API_KEY,
          credentialSecret: {
            apiKey: `${THESUBTITLEDB_LATE_API_KEY_PREFIX}${crypto.randomUUID()}`,
          },
        },
      ],
    });
    await openSignedIn(page, userConfig);
    const panel = await openTabMenuItem(page, THESUBTITLEDB);
    const checkAgain = panel.getByRole('button', {
      name: CHECK_AGAIN,
      exact: true,
    });
    await expect(checkAgain).toBeEnabled();
    await getAllSourcesCheckbox(page).click();
    await expect(checkAgain).toBeDisabled();
    const save = await holdRequest(
      page,
      getApiUrl(getUserConfigPath(userConfig.userConfigId)),
      {method: 'PATCH'},
    );

    await getVisibleSaveButton(page).click();
    const request = await save.request;

    await expect(checkAgain).toBeDisabled();
    save.release();
    await request.response();
  });

  test('Check again stays away while every key in the tab has a final status', async ({
    page,
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
    await openSignedIn(page, userConfig);

    const panel = await openTabMenuItem(page, THESUBTITLEDB);

    await expect(
      panel.getByText(CredentialStatus.label(CredentialStatus.VALID), {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      panel.getByRole('button', {name: CHECK_AGAIN, exact: true}),
    ).toHaveCount(0);
  });

  test('a switched-off source marks the page unsaved, is saved off and stays off after a reload', async ({
    page,
    userConfigs,
  }) => {
    const userConfig = await userConfigs.create({
      password: PASSWORD,
      languageCodes: STORED_LANGUAGE_CODES,
    });
    await openSignedIn(page, userConfig);
    const panel = await openTabMenuItem(page, OPENSUBTITLES_V3);

    await getSourceSwitch(panel, OPENSUBTITLES_V3).click();

    await expect(getUnsavedNotice(page)).toBeVisible();
    const patch = await saveAndSettle(page, userConfig);
    expect(patch.postDataJSON().subtitleSourceSwitchStates).toMatchObject({
      [SubtitleSource.OPENSUBTITLES_V3]: false,
    });

    await page.reload();

    const reloadedPanel = await openTabMenuItem(page, OPENSUBTITLES_V3);
    await expect(
      getSourceSwitch(reloadedPanel, OPENSUBTITLES_V3),
    ).not.toBeChecked();
    await expect(getAllSourcesCheckbox(page)).toBeChecked({
      indeterminate: true,
    });
  });

  test('a key saved from the page is sent back with its credentialId on the next save', async ({
    page,
    userConfigs,
  }) => {
    const userConfig = await userConfigs.create({
      password: PASSWORD,
      languageCodes: STORED_LANGUAGE_CODES,
    });
    await openSignedIn(page, userConfig);
    const panel = await openTabMenuItem(page, THESUBTITLEDB);
    await panel.getByRole('button', {name: ADD_API_KEY, exact: true}).click();
    await panel
      .getByLabel(API_KEY, {exact: true})
      .fill(THESUBTITLEDB_VALID_API_KEY);
    await saveAndSettle(page, userConfig);
    const v3Panel = await openTabMenuItem(page, OPENSUBTITLES_V3);
    await getSourceSwitch(v3Panel, OPENSUBTITLES_V3).click();

    const patch = await saveAndSettle(page, userConfig);

    expect(patch.postDataJSON().credentials).toEqual([
      {
        credentialId: expect.any(String),
        subtitleSource: SubtitleSource.THESUBTITLEDB,
        credentialKind: CredentialKind.API_KEY,
        credentialSecret: {apiKey: ''},
      },
    ]);
  });

  test('a save with a blank new key in another tab opens that tab on the key', async ({
    page,
    userConfigs,
  }) => {
    const userConfig = await userConfigs.create({
      password: PASSWORD,
      languageCodes: STORED_LANGUAGE_CODES,
    });
    await openSignedIn(page, userConfig);
    const panel = await openTabMenuItem(page, THESUBTITLEDB);
    await panel.getByRole('button', {name: ADD_API_KEY, exact: true}).click();
    await openTabMenuItem(page, SUBSOURCE);

    await getVisibleSaveButton(page).click();

    const apiKeyField = getTabPanel(page, THESUBTITLEDB).getByLabel(API_KEY, {
      exact: true,
    });
    await expect(apiKeyField).toBeFocused();
    await expect(apiKeyField).toHaveAttribute('aria-invalid', 'true');
  });

  test('a key the source rejects shows as invalid and marks its tab', async ({
    page,
    userConfigs,
  }) => {
    const userConfig = await userConfigs.create({
      password: PASSWORD,
      languageCodes: STORED_LANGUAGE_CODES,
      credentials: [
        {
          subtitleSource: SubtitleSource.THESUBTITLEDB,
          credentialKind: CredentialKind.API_KEY,
          credentialSecret: {apiKey: REJECTED_API_KEY},
        },
      ],
    });

    await openSignedIn(page, userConfig);

    const panel = await openTabMenuItem(page, THESUBTITLEDB);
    await expect(
      panel.getByText(CredentialStatus.label(CredentialStatus.INVALID), {
        exact: true,
      }),
    ).toBeVisible();
    const destructiveColor = await readTokenColor(page, '--destructive-text');
    const tabMenuItems = await openTabMenuItems(page);
    await expect(
      tabMenuItems.getByText(THESUBTITLEDB, {exact: true}),
    ).toHaveCSS('color', destructiveColor);
    await expect(
      tabMenuItems.getByText(SUBSOURCE, {exact: true}),
    ).not.toHaveCSS('color', destructiveColor);
  });

  test('an OpenSubtitles account shows the downloads it has left today', async ({
    page,
    userConfigs,
  }) => {
    const userConfig = await userConfigs.create({
      password: PASSWORD,
      languageCodes: STORED_LANGUAGE_CODES,
      credentials: [
        {
          subtitleSource: SubtitleSource.OPENSUBTITLES,
          credentialKind: CredentialKind.ACCOUNT,
          credentialSecret: {...OPENSUBTITLES_VALID_ACCOUNT},
        },
      ],
    });

    await openSignedIn(page, userConfig);

    const panel = await openTabMenuItem(page, OPENSUBTITLES);
    await expect(
      panel.getByText('17 downloads left today', {exact: true}),
    ).toBeVisible();
    await expect(
      panel.getByText('Use your own API key (optional)', {exact: true}),
    ).toBeVisible();
    await expect(panel.getByText(QUOTA_TOTAL_PATTERN)).toHaveCount(0);
  });

  test('a quota whose reset time has passed shows no downloads left', async ({
    page,
    userConfigs,
  }) => {
    const userConfig = await userConfigs.create({
      password: PASSWORD,
      languageCodes: STORED_LANGUAGE_CODES,
      credentials: [
        {
          subtitleSource: SubtitleSource.OPENSUBTITLES,
          credentialKind: CredentialKind.ACCOUNT,
          credentialSecret: {...OPENSUBTITLES_STALE_QUOTA_ACCOUNT},
        },
      ],
    });

    await openSignedIn(page, userConfig);

    const panel = await openTabMenuItem(page, OPENSUBTITLES);
    await expect(
      panel.getByText(CredentialStatus.label(CredentialStatus.VALID), {
        exact: true,
      }),
    ).toBeVisible();
    await expect(panel.getByText(/left today/)).toHaveCount(0);
  });

  test('the global control is disabled while every listed source is locked', async ({
    page,
    userConfigs,
  }) => {
    await page.route(getApiUrl(SUBTITLE_SOURCES_PATH), async route => {
      const response = await route.fetch();
      const envelope = await response.json();
      await route.fulfill({
        response,
        json: {
          ...envelope,
          data: envelope.data.filter(
            ({subtitleSource}) =>
              subtitleSource === SubtitleSource.THESUBTITLEDB,
          ),
        },
      });
    });
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

    await openSignedIn(page, userConfig);

    const allSources = getAllSourcesCheckbox(page);
    await expect(allSources).toBeChecked();
    await expect(allSources).toBeDisabled();
  });

  test.describe('with a 422 on a stored account password', () => {
    test.use({
      allowedConsoleError: getFailedRequestPattern({
        [USER_CONFIG_PATH]: [StatusCodes.UNPROCESSABLE_ENTITY],
      }),
    });

    test('shows the server message under the Password field', async ({
      page,
      userConfigs,
    }) => {
      const userConfig = await userConfigs.create({
        password: PASSWORD,
        languageCodes: STORED_LANGUAGE_CODES,
        credentials: [
          {
            subtitleSource: SubtitleSource.OPENSUBTITLES,
            credentialKind: CredentialKind.ACCOUNT,
            credentialSecret: {...OPENSUBTITLES_VALID_ACCOUNT},
          },
        ],
      });
      await openSignedIn(page, userConfig);
      const panel = await openTabMenuItem(page, OPENSUBTITLES);
      await page.route(
        getApiUrl(getUserConfigPath(userConfig.userConfigId)),
        route =>
          route.request().method() === 'PATCH'
            ? route.fulfill({
                status: StatusCodes.UNPROCESSABLE_ENTITY,
                json: getValidationEnvelope([
                  {
                    field: 'credentials.0.credentialSecret.password',
                    message: STORED_SECRET_MESSAGE,
                  },
                ]),
              })
            : route.fallback(),
      );
      const passwordField = panel.getByLabel('Password', {exact: true});
      await passwordField.fill(OPENSUBTITLES_VALID_ACCOUNT.password);

      await getVisibleSaveButton(page).click();

      await expect(passwordField).toHaveAttribute('aria-invalid', 'true');
      await expect(passwordField).toHaveAccessibleDescription(
        STORED_SECRET_MESSAGE,
      );
    });
  });

  test('a stored OpenSubtitles account takes a new password alone and keeps its username', async ({
    page,
    userConfigs,
  }) => {
    const userConfig = await userConfigs.create({
      password: PASSWORD,
      languageCodes: STORED_LANGUAGE_CODES,
      credentials: [
        {
          subtitleSource: SubtitleSource.OPENSUBTITLES,
          credentialKind: CredentialKind.ACCOUNT,
          credentialSecret: {
            username: OPENSUBTITLES_VALID_ACCOUNT.username,
            password: REJECTED_ACCOUNT.password,
          },
        },
      ],
    });
    await openSignedIn(page, userConfig);
    const panel = await openTabMenuItem(page, OPENSUBTITLES);
    await expect(
      panel.getByText(CredentialStatus.label(CredentialStatus.INVALID), {
        exact: true,
      }),
    ).toBeVisible();

    await panel
      .getByLabel('Password', {exact: true})
      .fill(OPENSUBTITLES_VALID_ACCOUNT.password);
    await saveAndSettle(page, userConfig);

    await expect(
      panel.getByText(CredentialStatus.label(CredentialStatus.VALID), {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      panel.getByText('17 downloads left today', {exact: true}),
    ).toBeVisible();
  });

  test('more than one OpenSubtitles account adds a total of the downloads left today', async ({
    page,
    userConfigs,
  }) => {
    const userConfig = await userConfigs.create({
      password: PASSWORD,
      languageCodes: STORED_LANGUAGE_CODES,
      credentials: [OPENSUBTITLES_VALID_ACCOUNT, REJECTED_ACCOUNT].map(
        account => ({
          subtitleSource: SubtitleSource.OPENSUBTITLES,
          credentialKind: CredentialKind.ACCOUNT,
          credentialSecret: {...account},
        }),
      ),
    });

    await openSignedIn(page, userConfig);

    const panel = await openTabMenuItem(page, OPENSUBTITLES);
    await expect(
      panel.getByText('17 downloads left today in total', {exact: true}),
    ).toBeVisible();
    await expect(
      panel.getByText(CredentialStatus.label(CredentialStatus.INVALID), {
        exact: true,
      }),
    ).toBeVisible();
  });
});
