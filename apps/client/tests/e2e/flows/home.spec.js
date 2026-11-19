import {expect, test} from '../lib/test.js';

test.describe('the home page', () => {
  test('leads to the configure page', async ({page}) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/configure$/);
    await expect(
      page.getByRole('main').getByRole('heading', {level: 1}),
    ).toBeVisible();
  });
});
