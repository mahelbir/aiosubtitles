import {escapeRegExp} from 'es-toolkit';
import {
  expectFixtureState,
  openFixture,
  readFixtureState,
} from '../lib/fixture-page.js';
import {getLoadingStatus, getSaveButton} from '../lib/locators.js';
import {
  API_DEPARTMENTS,
  getDepartmentsResponse,
  stubDepartments,
} from '../lib/option-lists.js';
import {expect, test} from '../lib/test.js';

const WHOLE_LIST_ERROR =
  'This control needs a source that loads the whole list.';
const CHANNEL_MESSAGE = 'En az bir kanal seçin';
const FIXTURE_SUBMIT_LABEL = 'Kaydet';
const CHANNEL_LABELS = ['E-posta', 'SMS', 'Anlık bildirim'];

function getOption(page, label) {
  return page.getByLabel(label, {exact: true});
}

function getSection(page, name) {
  return page.getByRole('group', {name, exact: true});
}

function getParent(page, section) {
  return page.getByRole('checkbox', {name: `Select all ${section}`});
}

function getSectionHeader(page, section) {
  return getSection(page, section).getByRole('button', {
    name: new RegExp(`^${section} `),
  });
}

function getSearch(page) {
  return page.getByRole('searchbox', {name: 'Search'});
}

function expectChecked(page, field = 'permissions') {
  return expect.poll(async () =>
    (await readFixtureState(page)).fields[field].value.toSorted(),
  );
}

async function checkLabels(page, labels) {
  for (const label of labels) {
    await page.getByText(label, {exact: true}).click();
  }
}

test.describe('checkbox group input', () => {
  test.beforeEach(async ({page}) => {
    await openFixture(page, 'checkbox-group-input');
  });

  test('renders each option group as a named group with a parent checkbox', async ({
    page,
  }) => {
    for (const section of ['Kullanıcılar', 'Roller', 'Ayarlar']) {
      await expect(getSection(page, section)).toBeVisible();
      await expect(
        getSection(page, section).getByRole('checkbox', {
          name: `Select all ${section}`,
        }),
      ).toBeVisible();
    }
  });

  test('a section holding a selected value starts open, the others expand from their header', async ({
    page,
  }) => {
    const roles = getSectionHeader(page, 'Roller');

    await expect(getSectionHeader(page, 'Kullanıcılar')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(getSectionHeader(page, 'Kullanıcılar')).toContainText('1/4');
    await expect(roles).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('Rol ekle', {exact: true})).toBeHidden();

    await roles.click();

    await expect(roles).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Rol ekle', {exact: true})).toBeVisible();
  });

  test('a section parent is mixed while some options are checked and checked once all are', async ({
    page,
  }) => {
    const parent = getParent(page, 'Kullanıcılar');

    await expect(parent).toHaveAttribute('aria-checked', 'mixed');

    await checkLabels(page, [
      'Kullanıcıları görüntüle',
      'Kullanıcı ekle',
      'Kullanıcı düzenle',
    ]);

    await expect(parent).toHaveAttribute('aria-checked', 'true');
    await expectChecked(page).toEqual([
      'users.create',
      'users.delete',
      'users.read',
      'users.update',
    ]);
  });

  test('a third click on a fully selected section restores the partial selection', async ({
    page,
  }) => {
    const parent = getParent(page, 'Kullanıcılar');
    await checkLabels(page, ['Kullanıcıları görüntüle', 'Kullanıcı düzenle']);
    const partial = ['users.delete', 'users.read', 'users.update'];
    await expectChecked(page).toEqual(partial);

    await parent.click();
    await expect(parent).toHaveAttribute('aria-checked', 'true');
    await expectChecked(page).toEqual([
      'users.create',
      'users.delete',
      'users.read',
      'users.update',
    ]);

    await parent.click();
    await expect(parent).toHaveAttribute('aria-checked', 'mixed');
    await expectChecked(page).toEqual(['users.delete']);

    await parent.click();
    await expect(parent).toHaveAttribute('aria-checked', 'mixed');
    await expectChecked(page).toEqual(partial);
    await expect(getOption(page, 'Kullanıcı ekle')).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  test('disabled options keep their state across select all and none', async ({
    page,
  }) => {
    const usersParent = getParent(page, 'Kullanıcılar');
    const locked = getOption(page, 'Kullanıcı sil');

    await usersParent.click();
    await expect(locked).toHaveAttribute('aria-checked', 'true');
    await usersParent.click();
    await expect(locked).toHaveAttribute('aria-checked', 'true');
    await expect(locked).toBeDisabled();

    const rolesParent = getParent(page, 'Roller');
    await rolesParent.click();
    await getSectionHeader(page, 'Roller').click();

    await expect(rolesParent).toHaveAttribute('aria-checked', 'true');
    await expect(getOption(page, 'Rol sil')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await expectChecked(page).toEqual([
      'roles.create',
      'roles.read',
      'users.delete',
    ]);
  });

  test('the form value holds exactly the checked values', async ({page}) => {
    await getSectionHeader(page, 'Ayarlar').click();

    await checkLabels(page, [
      'Ayarları düzenle',
      'Kullanıcı ekle',
      'Ayarları görüntüle',
    ]);
    await page.getByText('Ayarları düzenle', {exact: true}).click();

    await expectChecked(page).toEqual([
      'settings.read',
      'users.create',
      'users.delete',
    ]);
  });

  test('search narrows the visible options across sections without changing the value', async ({
    page,
  }) => {
    await getSearch(page).pressSequentially('sil');

    await expect(page.getByText('Kullanıcı sil', {exact: true})).toBeVisible();
    await expect(page.getByText('Rol sil', {exact: true})).toBeVisible();
    await expect(page.getByText('Kullanıcı ekle', {exact: true})).toHaveCount(
      0,
    );
    await expect(getSection(page, 'Ayarlar')).toHaveCount(0);
    await expectChecked(page).toEqual(['users.delete']);
  });

  test('search ignores case in the app locale', async ({page}) => {
    await getSearch(page).pressSequentially('ROL EKLE');

    await expect(page.getByText('Rol ekle', {exact: true})).toBeVisible();
    await expect(
      page.getByText('Rolleri görüntüle', {exact: true}),
    ).toHaveCount(0);
  });

  test('search keeps ı and i apart', async ({page}) => {
    await getSearch(page).pressSequentially('kullanici');

    await expect(page.getByText('Kullanıcı ekle', {exact: true})).toHaveCount(
      0,
    );
  });

  test('under a search a section parent selects only the visible matches', async ({
    page,
  }) => {
    await getSearch(page).pressSequentially('görüntüle');

    await getParent(page, 'Ayarlar').click();

    await expect(getParent(page, 'Ayarlar')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expectChecked(page).toEqual(['settings.read', 'users.delete']);
  });

  test('Space toggles the focused box', async ({page}) => {
    const option = getOption(page, 'Kullanıcı ekle');
    await option.focus();

    await page.keyboard.press('Space');

    await expect(option).toHaveAttribute('aria-checked', 'true');
    await expectChecked(page).toEqual(['users.create', 'users.delete']);

    await page.keyboard.press('Space');

    await expect(option).toHaveAttribute('aria-checked', 'false');
    await expectChecked(page).toEqual(['users.delete']);
  });

  test('a short ungrouped list renders flat checkboxes without a search box', async ({
    page,
  }) => {
    const channels = page.getByRole('group', {name: 'Kanallar', exact: true});

    await expect(channels.getByRole('searchbox')).toHaveCount(0);
    await expect(
      channels.getByRole('checkbox', {name: /^Select all /}),
    ).toHaveCount(0);

    await page.getByText('SMS', {exact: true}).click();

    await expect(getOption(page, 'SMS')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expectChecked(page, 'channels').toEqual(['sms']);
  });
});

test.describe('a checkbox group over another source', () => {
  test('a preloaded source announces its loading, then renders its options', async ({
    page,
  }) => {
    const {promise, resolve} = Promise.withResolvers();
    await stubDepartments(page, async () => {
      await promise;
      return getDepartmentsResponse();
    });

    await openFixture(page, 'checkbox-group-input', {
      source: 'preloaded',
      api: true,
    });

    await expect(getLoadingStatus(page)).toBeVisible();
    resolve();
    for (const department of API_DEPARTMENTS) {
      await expect(getOption(page, department.label)).toBeVisible();
    }
  });

  test.describe('given a paged source', () => {
    test.use({allowedConsoleError: new RegExp(escapeRegExp(WHOLE_LIST_ERROR))});

    test('a paged source is refused with a developer error', async ({page}) => {
      await openFixture(page, 'checkbox-group-input', {source: 'pages'});

      await expect(
        page.getByRole('alert').filter({hasText: WHOLE_LIST_ERROR}),
      ).toBeVisible();
    });
  });
});

test.describe('a disabled checkbox group', () => {
  test('locks every box and section parent while search and section headers stay usable', async ({
    page,
  }) => {
    await openFixture(page, 'checkbox-group-input', {isDisabled: true});

    await Promise.all([
      expect(getParent(page, 'Kullanıcılar')).toBeDisabled(),
      expect(getOption(page, 'Kullanıcı ekle')).toBeDisabled(),
      ...CHANNEL_LABELS.map(label =>
        expect(getOption(page, label)).toBeDisabled(),
      ),
      expect(getSearch(page)).toBeEnabled(),
      expect(getSectionHeader(page, 'Roller')).toBeEnabled(),
    ]);
  });

  test('a submit skips its rule and leaves both values out of the payload', async ({
    page,
  }) => {
    await openFixture(page, 'checkbox-group-input', {isDisabled: true});

    await getSaveButton(page, FIXTURE_SUBMIT_LABEL).click();

    await expectFixtureState(page, 'submitted').toEqual({});
    await expect(page.getByText(CHANNEL_MESSAGE, {exact: true})).toHaveCount(0);
  });
});

test.describe('a read-only checkbox group', () => {
  test('keeps every box focusable but read-only, so Space and a click change nothing', async ({
    page,
  }) => {
    await openFixture(page, 'checkbox-group-input', {isReadOnly: true});
    const option = getOption(page, 'SMS');
    const parent = getParent(page, 'Kullanıcılar');

    await option.focus();
    await page.keyboard.press('Space');
    await parent.click();

    await Promise.all([
      expect(option).toBeEnabled(),
      expect(option).not.toBeEditable(),
      expect(option).toHaveAttribute('aria-checked', 'false'),
      expect(parent).toBeFocused(),
      expect(parent).toHaveAttribute('aria-checked', 'mixed'),
    ]);
    await expectFixtureState(page, 'fields').toMatchObject({
      permissions: {value: ['users.delete']},
      channels: {value: []},
    });
  });

  test('a submit sends its values', async ({page}) => {
    await openFixture(page, 'checkbox-group-input', {
      isReadOnly: true,
      hasChannel: true,
    });

    await getSaveButton(page, FIXTURE_SUBMIT_LABEL).click();

    await expectFixtureState(page, 'submitted').toEqual({
      permissions: ['users.delete'],
      channels: ['email'],
    });
  });

  test('its rule blocks the submit, shows its error and focuses its first box', async ({
    page,
  }) => {
    await openFixture(page, 'checkbox-group-input', {isReadOnly: true});

    await getSaveButton(page, FIXTURE_SUBMIT_LABEL).click();

    await Promise.all([
      expect(page.getByText(CHANNEL_MESSAGE, {exact: true})).toBeVisible(),
      expect(getOption(page, 'E-posta')).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
      expect(getOption(page, 'E-posta')).toBeFocused(),
    ]);
    await expectFixtureState(page, 'submitted').toBeNull();
  });
});
