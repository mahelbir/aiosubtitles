import {openFixture} from '../lib/fixture-page.js';
import {getDialog} from '../lib/locators.js';
import {PHONE_VIEWPORT, clickButton} from '../lib/page.js';
import {expect, test} from '../lib/test.js';

const BAR_INSET = 16;

function getMenuButton(scope) {
  return scope.getByRole('button', {name: 'Menü', exact: true});
}

function getThemeToggle(scope) {
  return scope.getByRole('button', {name: 'Temayı değiştir', exact: true});
}

function getBar(page) {
  return page.locator('header').filter({has: getMenuButton(page)});
}

function getEndGap(outer, inner) {
  return outer.x + outer.width - (inner.x + inner.width);
}

function getCenterY(box) {
  return box.y + box.height / 2;
}

function expectNear(actual, expected) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
}

async function openPanel(page) {
  await clickButton(page, 'Menü');
  const panel = getDialog(page, 'Sidebar');
  await expect
    .poll(async () => {
      const box = await panel.boundingBox();
      return Math.round(box.x + box.width);
    })
    .toBe(PHONE_VIEWPORT.width);
  return panel;
}

test.describe('admin shell', () => {
  test.beforeEach(async ({page}) => {
    await openFixture(page, 'admin-shell');
  });

  test('at a desktop width the bar runs from the menu button to the theme toggle', async ({
    page,
  }) => {
    const bar = getBar(page);
    const menuButton = getMenuButton(bar);
    const toggle = getThemeToggle(bar);

    await Promise.all([
      expect(menuButton.locator('.lucide-panel-left')).toBeVisible(),
      expect(menuButton.locator('.lucide-menu')).toBeHidden(),
      expect(toggle).toBeVisible(),
      expect(getThemeToggle(page)).toHaveCount(1),
      expect(bar.getByRole('link')).toHaveCount(0),
      expect(
        page.locator('[data-slot="sidebar-header"]').getByRole('link'),
      ).toHaveAttribute('href', '/admin'),
    ]);
    const [barBox, menuBox, toggleBox, settingsBox] = await Promise.all([
      bar.boundingBox(),
      menuButton.boundingBox(),
      toggle.boundingBox(),
      page.getByRole('link', {name: 'Ayarlar'}).boundingBox(),
    ]);

    expect(menuBox.x - barBox.x).toBeLessThanOrEqual(BAR_INSET);
    expect(getEndGap(barBox, toggleBox)).toBeLessThanOrEqual(BAR_INSET);
    expect(settingsBox.x).toBeLessThan(menuBox.x);
  });

  test.describe('at a phone width', () => {
    test.use({colorScheme: 'light', viewport: PHONE_VIEWPORT});

    test('the bar starts with the site name and ends with its only button, the menu', async ({
      page,
    }) => {
      const bar = getBar(page);
      const menuButton = getMenuButton(bar);
      const brand = bar.getByRole('link');

      await Promise.all([
        expect(bar.getByRole('button')).toHaveCount(1),
        expect(brand).toHaveCount(1),
        expect(menuButton.locator('.lucide-menu')).toBeVisible(),
        expect(menuButton.locator('.lucide-panel-left')).toBeHidden(),
      ]);
      const [barBox, brandBox, menuBox] = await Promise.all([
        bar.boundingBox(),
        brand.boundingBox(),
        menuButton.boundingBox(),
      ]);

      expect(brandBox.x - barBox.x).toBeLessThanOrEqual(BAR_INSET);
      expect(getEndGap(barBox, menuBox)).toBeLessThanOrEqual(BAR_INSET);
    });

    test('the panel starts with the site name and puts a close button where the menu button sits', async ({
      page,
    }) => {
      const bar = getBar(page);
      const [barBox, menuBox, brandName] = await Promise.all([
        bar.boundingBox(),
        getMenuButton(bar).boundingBox(),
        bar.getByRole('link').textContent(),
      ]);
      const panel = await openPanel(page);
      const brand = panel.getByRole('link', {name: brandName, exact: true});
      const closeButton = panel.getByRole('button', {name: 'Menüyü kapat'});
      const [panelBox, brandBox, closeBox] = await Promise.all([
        panel.boundingBox(),
        brand.boundingBox(),
        closeButton.boundingBox(),
      ]);

      expect(brandBox.x - panelBox.x).toBeLessThanOrEqual(BAR_INSET);
      expectNear(getCenterY(brandBox), getCenterY(closeBox));
      expectNear(getEndGap(panelBox, closeBox), getEndGap(barBox, menuBox));
      expectNear(closeBox.y - panelBox.y, menuBox.y - barBox.y);

      await closeButton.click();

      await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    test('the menu button opens the panel against the end of the screen', async ({
      page,
    }) => {
      const panel = await openPanel(page);

      await expect(panel).toBeVisible();
    });

    test('the theme toggle sits beside the user menu and leaves the panel open when pressed', async ({
      page,
    }) => {
      const panel = await openPanel(page);
      const toggle = getThemeToggle(panel);
      const userMenu = panel.getByRole('button', {name: 'Kullanıcı menüsü'});
      const [toggleBox, userMenuBox] = await Promise.all([
        toggle.boundingBox(),
        userMenu.boundingBox(),
      ]);

      expect(getCenterY(toggleBox)).toBeCloseTo(getCenterY(userMenuBox), 0);
      expect(toggleBox.x).toBeGreaterThanOrEqual(
        userMenuBox.x + userMenuBox.width,
      );

      await toggle.click();

      await Promise.all([
        expect(page.locator('html')).toHaveClass(/\bdark\b/),
        expect(panel).toBeVisible(),
      ]);
    });
  });
});
