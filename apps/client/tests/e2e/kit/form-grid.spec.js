import {openFixture} from '../lib/fixture-page.js';
import {
  expectAnimated,
  recordAnimations,
  settleAnimatedPositions,
  trackBoxDuring,
  waitForAnimations,
} from '../lib/page.js';
import {expect, test} from '../lib/test.js';

function getToggle(page) {
  return page.getByRole('checkbox', {name: 'Ek alan'});
}

function getPhone(page) {
  return page.getByRole('textbox', {name: 'Telefon'});
}

test.describe('form grid', () => {
  test('a field that appears animates in', async ({page}) => {
    await openFixture(page, 'form-grid');
    await recordAnimations(page);

    await getToggle(page).click();

    await expect(getPhone(page)).toBeVisible();
    await expectAnimated(page, 'Telefon').toBe(true);
  });

  test('a field that leaves is gone once its exit animation ends', async ({
    page,
  }) => {
    await openFixture(page, 'form-grid');
    await getToggle(page).click();
    await expect(getPhone(page)).toBeVisible();

    await getToggle(page).click();
    await waitForAnimations(page);

    await expect(getPhone(page)).toHaveCount(0);
  });

  test('the fields above a leaving field stay where they are', async ({
    page,
  }) => {
    await openFixture(page, 'form-grid');
    await getToggle(page).click();
    await expect(getPhone(page)).toBeVisible();
    await settleAnimatedPositions(page);

    const boxes = await trackBoxDuring(getToggle(page), () =>
      getToggle(page).click(),
    );

    expect(boxes).toHaveLength(1);
  });
});
