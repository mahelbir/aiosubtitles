import {
  ADMIN_THEME_KEY,
  PUBLIC_THEME_KEY,
  THEME_COLORS,
} from '../../../src/config/theme.js';
import {
  expectFixtureState,
  openFixture,
  openPublicFixture,
} from '../lib/fixture-page.js';
import {expect, test} from '../lib/test.js';

function getToggle(page) {
  return page.getByRole('button', {name: 'Temayı değiştir'});
}

function getRoot(page) {
  return page.locator('html');
}

function readStoredTheme(page, key = ADMIN_THEME_KEY) {
  return page.evaluate(name => localStorage.getItem(name), key);
}

function readBodyColor(page) {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

function readThemeColorMetas(page) {
  return page.evaluate(() =>
    [...document.head.querySelectorAll('meta[name="theme-color"]')].map(
      meta => meta.content,
    ),
  );
}

async function expectThemeColorToFollowBody(page) {
  const color = await readBodyColor(page);
  await expect
    .poll(() => readThemeColorMetas(page))
    .toEqual(THEME_COLORS.map(() => color));
  return color;
}

async function expectAppliedTheme(page, theme) {
  await expect(getRoot(page)).toHaveClass(new RegExp(`\\b${theme}\\b`));
  await expect(getRoot(page)).toHaveCSS('color-scheme', theme);
}

function expectThemeIcon(page, shown, hidden) {
  const toggle = getToggle(page);
  return Promise.all([
    expect(toggle.locator(`.lucide-${shown}`)).toBeVisible(),
    expect(toggle.locator(`.lucide-${hidden}`)).toBeHidden(),
  ]);
}

test.describe('theme on a light system', () => {
  test.use({colorScheme: 'light'});

  test.beforeEach(async ({page}) => {
    await openFixture(page, 'theme');
  });

  test('toggling to dark sets the dark class and color scheme on html, persists the choice and survives a reload', async ({
    page,
  }) => {
    await expectAppliedTheme(page, 'light');
    await expectFixtureState(page).toEqual({
      theme: 'system',
      resolvedTheme: 'light',
      systemTheme: 'light',
    });

    await getToggle(page).click();

    await expectAppliedTheme(page, 'dark');
    await expectFixtureState(page).toMatchObject({
      theme: 'dark',
      resolvedTheme: 'dark',
    });
    expect(await readStoredTheme(page)).toBe('dark');

    await openFixture(page, 'theme');

    await expectAppliedTheme(page, 'dark');
    await expectFixtureState(page).toMatchObject({
      theme: 'dark',
      resolvedTheme: 'dark',
      systemTheme: 'light',
    });
  });

  test('toggling from dark returns to light', async ({page}) => {
    await getToggle(page).click();
    await expectAppliedTheme(page, 'dark');

    await getToggle(page).click();

    await expectAppliedTheme(page, 'light');
    expect(await readStoredTheme(page)).toBe('light');
  });

  test('the toggle shows the icon of the other theme and keeps it through a reload', async ({
    page,
  }) => {
    await expectThemeIcon(page, 'moon', 'sun');

    await getToggle(page).click();

    await expectThemeIcon(page, 'sun', 'moon');

    await page.reload();

    await expectThemeIcon(page, 'sun', 'moon');
  });

  test('the theme-color meta follows the painted background of the active theme', async ({
    page,
  }) => {
    const lightColor = await expectThemeColorToFollowBody(page);

    await getToggle(page).click();
    await expectAppliedTheme(page, 'dark');

    const darkColor = await expectThemeColorToFollowBody(page);
    expect(darkColor).not.toBe(lightColor);
  });
});

test.describe('theme across root layouts on a light system', () => {
  test.use({colorScheme: 'light'});

  test('a choice made in the admin reaches neither the public pages nor the landing', async ({
    page,
  }) => {
    await openFixture(page, 'theme');
    await getToggle(page).click();
    await expectAppliedTheme(page, 'dark');

    await openPublicFixture(page, 'theme');

    await expectAppliedTheme(page, 'light');
    expect(await readStoredTheme(page, PUBLIC_THEME_KEY)).toBeNull();

    await page.goto('/');

    await expectAppliedTheme(page, 'light');
  });

  test('a choice made on a public page persists there and leaves the admin alone', async ({
    page,
  }) => {
    await openPublicFixture(page, 'theme');
    await getToggle(page).click();
    await expectAppliedTheme(page, 'dark');

    await openPublicFixture(page, 'theme');

    await expectAppliedTheme(page, 'dark');
    expect(await readStoredTheme(page, PUBLIC_THEME_KEY)).toBe('dark');

    await openFixture(page, 'theme');

    await expectAppliedTheme(page, 'light');
    expect(await readStoredTheme(page)).toBeNull();
  });
});

test.describe('theme on a dark system', () => {
  test.use({colorScheme: 'dark'});

  test('the system theme follows the preferred color scheme live, without storing a choice', async ({
    page,
  }) => {
    await openFixture(page, 'theme');

    await expectAppliedTheme(page, 'dark');
    await expectFixtureState(page).toEqual({
      theme: 'system',
      resolvedTheme: 'dark',
      systemTheme: 'dark',
    });

    await page.emulateMedia({colorScheme: 'light'});

    await expectAppliedTheme(page, 'light');
    await expectFixtureState(page).toMatchObject({
      theme: 'system',
      resolvedTheme: 'light',
    });
    expect(await readStoredTheme(page)).toBeNull();
  });
});
