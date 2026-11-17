import {expectFixtureState, openFixture} from '../lib/fixture-page.js';
import {getDialog} from '../lib/locators.js';
import {PHONE_VIEWPORT, clickButton} from '../lib/page.js';
import {expect, test} from '../lib/test.js';

const SETTINGS_CLICKS = Object.freeze({settings: 1, settingsHost: 1});

function getSettingsLink(scope) {
  return scope.getByRole('link', {name: 'Ayarlar'});
}

function getProfileLink(scope) {
  return scope.getByRole('link', {name: 'Profil'});
}

function getReportsButton(scope) {
  return scope.getByRole('button', {name: 'Raporlar'});
}

function getReportsMenu(page) {
  return page.getByRole('menu', {name: 'Raporlar'});
}

function expectNavState(page, {clicks, ...state}) {
  return expectFixtureState(page).toMatchObject({
    ...state,
    clicks: {daily: 0, profile: 0, settings: 0, settingsHost: 0, ...clicks},
  });
}

function expectClosedWith(page, surface, state) {
  return Promise.all([
    expect(surface).toHaveCount(0),
    expectNavState(page, state),
  ]);
}

async function openSheet(page) {
  await openFixture(page, 'admin-nav');
  await expectNavState(page, {isMobile: true, isMobileOpen: false});

  await clickButton(page, 'Toggle Sidebar');

  const sheet = getDialog(page, 'Sidebar');
  await Promise.all([
    expect(sheet).toBeVisible(),
    expectNavState(page, {isMobileOpen: true}),
  ]);
  return sheet;
}

async function openCollapsed(page) {
  await openFixture(page, 'admin-nav', {isCollapsed: true});
  await expectNavState(page, {isMobile: false, sidebarState: 'collapsed'});
}

test.describe('admin nav', () => {
  test('an item’s link props and its host’s active state reach its link while the item keeps its own href', async ({
    page,
  }) => {
    await openFixture(page, 'admin-nav');
    const help = page.getByRole('link', {name: 'Yardım'});
    const settings = getSettingsLink(page);

    await Promise.all([
      expect(help).toHaveAttribute('href', 'https://ornek.com/yardim'),
      expect(help).toHaveAttribute('target', '_blank'),
      expect(help).toHaveAttribute('rel', 'noreferrer'),
      expect(help).toHaveAttribute('aria-current', 'page'),
      expect(help).toHaveAttribute('data-active', ''),
      expect(settings).toHaveAttribute('title', 'Ayarlar sayfası'),
      expect(settings).not.toHaveAttribute('aria-current'),
      expect(settings).not.toHaveAttribute('data-active'),
    ]);
  });

  test('an item’s className joins its host’s instead of replacing it', async ({
    page,
  }) => {
    await openFixture(page, 'admin-nav');

    await expect(getSettingsLink(page)).toContainClass('italic underline');
  });

  test('an item’s className wins over a clashing utility of its host', async ({
    page,
  }) => {
    await openFixture(page, 'admin-nav');

    await expect(getSettingsLink(page)).toHaveCSS('padding', '0px');
  });

  test('an item’s aria-current survives a host that is not active', async ({
    page,
  }) => {
    await openFixture(page, 'admin-nav');
    const profile = getProfileLink(page);

    await Promise.all([
      expect(profile).toHaveAttribute('aria-current', 'location'),
      expect(profile).not.toHaveAttribute('data-active'),
    ]);
  });

  test.describe('at a phone width', () => {
    test.use({viewport: PHONE_VIEWPORT});

    test('clicking an item runs its own and its host’s click handlers and closes the sheet', async ({
      page,
    }) => {
      const sheet = await openSheet(page);

      await getSettingsLink(sheet).click();

      await expectClosedWith(page, sheet, {
        clicks: SETTINGS_CLICKS,
        isMobileOpen: false,
      });
    });

    test('Enter on a focused item runs both click handlers and closes the sheet', async ({
      page,
    }) => {
      const sheet = await openSheet(page);
      await getSettingsLink(sheet).focus();

      await page.keyboard.press('Enter');

      await expectClosedWith(page, sheet, {
        clicks: SETTINGS_CLICKS,
        isMobileOpen: false,
      });
    });

    test('an item whose click handler prevents the default runs it and keeps the sheet open', async ({
      page,
    }) => {
      const sheet = await openSheet(page);

      await getProfileLink(sheet).click();

      await Promise.all([
        expect(sheet).toBeVisible(),
        expectNavState(page, {clicks: {profile: 1}, isMobileOpen: true}),
      ]);
    });

    test('a group’s sub-item runs its click handler and closes the sheet', async ({
      page,
    }) => {
      const sheet = await openSheet(page);
      await getReportsButton(sheet).click();

      await sheet.getByRole('link', {name: 'Günlük'}).click();

      await expectClosedWith(page, sheet, {
        clicks: {daily: 1},
        isMobileOpen: false,
      });
    });
  });

  test.describe('collapsed to icons', () => {
    test('a group opens a menu whose item runs its click handler and closes the menu', async ({
      page,
    }) => {
      await openCollapsed(page);
      await getReportsButton(page).click();
      const menu = getReportsMenu(page);

      await menu.getByRole('menuitem', {name: 'Günlük'}).click();

      await expectClosedWith(page, menu, {clicks: {daily: 1}});
    });

    test('the keyboard opens the menu, moves past the first item and chooses the second', async ({
      page,
    }) => {
      await openCollapsed(page);
      await getReportsButton(page).focus();
      const menu = getReportsMenu(page);

      await page.keyboard.press('Enter');
      await expect(menu.getByRole('menuitem', {name: 'Özet'})).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(menu.getByRole('menuitem', {name: 'Günlük'})).toBeFocused();
      await page.keyboard.press('Enter');

      await expectClosedWith(page, menu, {clicks: {daily: 1}});
    });
  });
});
