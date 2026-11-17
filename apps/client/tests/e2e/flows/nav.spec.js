import {expectSignedInAs, getSignOutItem, getUserMenu} from '../lib/auth.js';
import {ADMIN_ACCOUNT} from '../lib/backend.js';
import {getMonitorLevelSelect} from '../lib/locators.js';
import {clickButton, expectPageTitle} from '../lib/page.js';
import {expect, test} from '../lib/test.js';

const PANEL_HREF = '/admin';

const GROUP_LABEL = 'Monitör';

const NAV_ITEMS = Object.freeze([
  {
    label: 'Ayarlar',
    href: '/admin/settings',
    getAnchor: page => page.getByRole('textbox', {name: 'Uygulama Adı'}),
  },
  {label: 'Kullanıcılar', href: '/admin/users'},
  {label: 'Roller', href: '/admin/roles'},
]);

const GROUP_ITEMS = Object.freeze([
  {
    label: 'Heartbeat',
    href: '/admin/monitor?scope=heartbeat&title=Heartbeat',
    getAnchor: getMonitorLevelSelect,
  },
]);

const ALL_ITEMS = Object.freeze([...NAV_ITEMS, ...GROUP_ITEMS]);

const PROBE_LABEL = 'Ayarlar';

const [HEARTBEAT_ITEM] = GROUP_ITEMS;

function getBrandLink(page) {
  return page.getByRole('link').and(page.locator(`[href="${PANEL_HREF}"]`));
}

function getPageHeading(page, name) {
  return page.getByRole('heading', {level: 1, name});
}

function getSidebarNav(page) {
  return page.getByRole('list').filter({
    has: page.getByRole('link', {name: PROBE_LABEL, exact: true}),
  });
}

function getSidebarLink(page, label) {
  return getSidebarNav(page).getByRole('link', {name: label, exact: true});
}

function getSidebarLabel(page, label) {
  return getSidebarNav(page).getByText(label, {exact: true});
}

function getGroupButton(page) {
  return getSidebarNav(page).getByRole('button', {
    name: GROUP_LABEL,
    exact: true,
  });
}

function getGroupMenu(page) {
  return page.getByRole('menu', {name: GROUP_LABEL});
}

function isGroupItem(label) {
  return GROUP_ITEMS.some(item => item.label === label);
}

async function expectLinks(page, items) {
  const links = getSidebarNav(page).getByRole('link');

  await expect(links).toHaveText(items.map(({label}) => label));
  await Promise.all(
    items.map(({href}, index) =>
      expect(links.nth(index)).toHaveAttribute('href', href),
    ),
  );
}

function expectCurrentItem(page, current) {
  const items = isGroupItem(current) ? ALL_ITEMS : NAV_ITEMS;
  return Promise.all([
    ...items.map(({label}) =>
      label === current
        ? expect(getSidebarLink(page, label)).toHaveAttribute(
            'aria-current',
            'page',
          )
        : expect(getSidebarLink(page, label)).not.toHaveAttribute(
            'aria-current',
          ),
    ),
    expect(getGroupButton(page)).not.toHaveAttribute('aria-current'),
  ]);
}

async function expectItemOpens(
  page,
  {label, href, getAnchor = getPageHeading},
) {
  await getSidebarLink(page, label).click();

  await expect(page).toHaveURL(href);
  await Promise.all([
    expect(getAnchor(page, label)).toBeVisible(),
    expectPageTitle(page, label),
    expectCurrentItem(page, label),
  ]);
}

async function openDashboard(page) {
  await page.goto(PANEL_HREF);
  await expectSignedInAs(page, ADMIN_ACCOUNT);
}

test.describe('the admin sidebar', () => {
  test('lists the settings, users and roles items, then the Monitör group holding Heartbeat', async ({
    page,
  }) => {
    await openDashboard(page);
    const group = getGroupButton(page);

    await expect(getSidebarNav(page).getByRole('listitem')).toHaveText([
      ...NAV_ITEMS.map(({label}) => label),
      GROUP_LABEL,
    ]);
    await expectLinks(page, NAV_ITEMS);
    await expect(group).toHaveAttribute('aria-expanded', 'false');

    await group.click();

    await expect(group).toHaveAttribute('aria-expanded', 'true');
    await expectLinks(page, ALL_ITEMS);
  });

  test('each item opens its screen under its own title and alone marks itself current, while the dashboard marks none', async ({
    page,
  }) => {
    await openDashboard(page);
    await expectCurrentItem(page, null);

    for (const item of NAV_ITEMS) {
      await expectItemOpens(page, item);
    }

    await getGroupButton(page).click();

    for (const item of GROUP_ITEMS) {
      await expectItemOpens(page, item);
    }
  });

  test('a Monitör screen opens its group by itself', async ({page}) => {
    await page.goto(HEARTBEAT_ITEM.href);

    await expect(getGroupButton(page)).toHaveAttribute('aria-expanded', 'true');
    await expectCurrentItem(page, HEARTBEAT_ITEM.label);
  });

  test('the profile screen has no item and marks none current', async ({
    page,
  }) => {
    await page.goto('/admin/profile');
    await expect(page.getByRole('textbox', {name: 'E-posta'})).toBeVisible();

    await expectCurrentItem(page, null);
  });

  test('the brand leads to the dashboard', async ({page}) => {
    await page.goto('/admin/users');
    await expect(getPageHeading(page, 'Kullanıcılar')).toBeVisible();

    await getBrandLink(page).click();

    await expect(page).toHaveURL(PANEL_HREF);
    await expect(page.getByText('Kontrol Paneli', {exact: true})).toBeVisible();
  });

  test('the menu button collapses the sidebar to icons whose labels turn into tooltips, and a reload keeps it collapsed', async ({
    page,
  }) => {
    await openDashboard(page);
    const label = getSidebarLabel(page, PROBE_LABEL);
    await expect(label).toBeVisible();

    await clickButton(page, 'Menü');

    await expect(label).toBeHidden();
    await getSidebarLink(page, PROBE_LABEL).hover();
    await expect(
      page.getByText(PROBE_LABEL, {exact: true}).filter({visible: true}),
    ).toHaveCount(1);

    await page.reload();

    await expect(getSidebarLink(page, PROBE_LABEL)).toBeVisible();
    await expect(label).toBeHidden();

    await clickButton(page, 'Menü');

    await expect(label).toBeVisible();
  });

  test('collapsed to icons, the Monitör group opens a menu named after it, whose item leads to its screen and is marked current there', async ({
    page,
  }) => {
    await openDashboard(page);
    await clickButton(page, 'Menü');
    await expect(getSidebarLabel(page, PROBE_LABEL)).toBeHidden();
    const menu = getGroupMenu(page);

    await getGroupButton(page).click();

    await expect(menu.getByRole('menuitem')).toHaveText(
      GROUP_ITEMS.map(({label}) => label),
    );

    await menu.getByRole('menuitem', {name: HEARTBEAT_ITEM.label}).click();

    await expect(page).toHaveURL(HEARTBEAT_ITEM.href);
    await expect(HEARTBEAT_ITEM.getAnchor(page)).toBeVisible();
    await expect(menu).toHaveCount(0);

    await getGroupButton(page).click();

    await expect(
      menu.getByRole('menuitem', {name: HEARTBEAT_ITEM.label}),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('Ctrl or Cmd with B toggles the sidebar', async ({page}) => {
    await openDashboard(page);
    const label = getSidebarLabel(page, PROBE_LABEL);
    await expect(label).toBeVisible();

    await page.keyboard.press('ControlOrMeta+b');

    await expect(label).toBeHidden();

    await page.keyboard.press('ControlOrMeta+b');

    await expect(label).toBeVisible();
  });
});

test.describe('the user menu', () => {
  test('shows the signed-in email and offers the profile and sign-out, the profile leading to its screen', async ({
    page,
  }) => {
    await openDashboard(page);

    await getUserMenu(page).click();

    await expect(getSignOutItem(page)).toBeVisible();
    await page.getByRole('menuitem', {name: 'Profil'}).click();

    await expect(page).toHaveURL('/admin/profile');
    await expect(page.getByRole('textbox', {name: 'E-posta'})).toHaveValue(
      ADMIN_ACCOUNT.email,
    );
  });
});

test.describe('the panel footer', () => {
  test('shows the current year’s copyright and the app version stamp', async ({
    page,
  }) => {
    await openDashboard(page);

    await Promise.all([
      expect(
        page.getByText(new RegExp(`^© ${new Date().getFullYear()} `)),
      ).toBeVisible(),
      expect(page.getByText(/^v\d{6}\.\d{4}$/)).toBeVisible(),
    ]);
  });
});
