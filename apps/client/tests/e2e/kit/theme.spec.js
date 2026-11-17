import {APP_THEME, THEME_COLORS} from '../../../src/config/theme.js';
import {FIXTURES} from '../fixtures/registry.js';
import {expectFixtureState, openFixture} from '../lib/fixture-page.js';
import {expect, test} from '../lib/test.js';

const API_BOUND_FIXTURES = new Set(['app-error', 'boundaries']);

function getRoot(page) {
  return page.locator('html');
}

async function expectDarkTheme(page) {
  const root = getRoot(page);
  await expect(root).toHaveClass(/\bdark\b/);
  await expect(root).not.toHaveClass(/\blight\b/);
  await expect(root).toHaveCSS('color-scheme', APP_THEME);
}

function readPaintedColors(page) {
  return page.evaluate(
    configColors => {
      const probe = document.createElement('div');
      document.body.append(probe);
      const toRgb = color => {
        probe.style.backgroundColor = color;
        return getComputedStyle(probe).backgroundColor;
      };
      const colors = {
        body: getComputedStyle(document.body).backgroundColor,
        config: configColors.map(toRgb),
        metas: [
          ...document.head.querySelectorAll('meta[name="theme-color"]'),
        ].map(meta => toRgb(meta.content)),
      };
      probe.remove();
      return colors;
    },
    THEME_COLORS.map(({color}) => color),
  );
}

async function expectLandingDark(page) {
  await page.goto('/');
  await expectDarkTheme(page);
}

test.describe('theme on a light system', () => {
  test.use({colorScheme: 'light'});

  test('the landing page renders dark', async ({page}) => {
    await expectLandingDark(page);
  });

  for (const {slug} of FIXTURES.filter(
    fixture => !API_BOUND_FIXTURES.has(fixture.slug),
  )) {
    test(`the ${slug} fixture renders dark`, async ({page}) => {
      await openFixture(page, slug);

      await expectDarkTheme(page);
    });
  }
});

test.describe('theme without JavaScript', () => {
  test.use({colorScheme: 'light', javaScriptEnabled: false});

  test('the server HTML already renders dark', async ({page}) => {
    await expectLandingDark(page);
  });
});

test.describe('theme on a dark system', () => {
  test.use({colorScheme: 'dark'});

  test('the landing page renders dark', async ({page}) => {
    await expectLandingDark(page);
  });
});

test.describe('dark only', () => {
  test.use({colorScheme: 'light'});

  test('the theme is forced to dark and dark is the only theme', async ({
    page,
  }) => {
    await openFixture(page, 'theme');

    await expectFixtureState(page).toEqual({
      forcedTheme: APP_THEME,
      themes: [APP_THEME],
    });
  });

  test('both theme-color values and the painted background equal the dark background', async ({
    page,
  }) => {
    await openFixture(page, 'theme');

    const {body, config} = await readPaintedColors(page);
    expect(config).toEqual(THEME_COLORS.map(() => body));
    await expect
      .poll(async () => (await readPaintedColors(page)).metas)
      .toEqual(THEME_COLORS.map(() => body));
  });

  test('a stored light choice is ignored', async ({page}) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'light'));

    await openFixture(page, 'theme');

    await expectDarkTheme(page);
  });

  test('a live switch of the system preference keeps dark', async ({page}) => {
    await openFixture(page, 'theme');
    await expectDarkTheme(page);

    await page.emulateMedia({colorScheme: 'dark'});
    await page.emulateMedia({colorScheme: 'light'});

    await expectDarkTheme(page);
  });

  test('no theme toggle is rendered', async ({page}) => {
    await openFixture(page, 'theme');

    await expect(page.getByRole('button', {name: /theme|tema/i})).toHaveCount(
      0,
    );
  });
});
