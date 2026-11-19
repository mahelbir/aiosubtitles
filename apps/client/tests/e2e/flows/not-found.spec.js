import {StatusCodes} from 'http-status-codes';
import {getFailedPagePattern} from '../lib/api.js';
import {MISSING_PAGE_PATH} from '../lib/not-found.js';
import {expect, test} from '../lib/test.js';

test.describe('an unknown URL', () => {
  test.use({
    allowedConsoleError: getFailedPagePattern({
      [MISSING_PAGE_PATH]: [StatusCodes.NOT_FOUND],
    }),
  });

  test('renders the global not-found page, whose action leads to the configure page', async ({
    page,
  }) => {
    const response = await page.goto(MISSING_PAGE_PATH);

    expect(response.status()).toBe(StatusCodes.NOT_FOUND);
    await expect(page.getByRole('heading', {name: 'Sorry!'})).toBeVisible();
    await expect(
      page.getByText('The page you are looking for was not found.'),
    ).toBeVisible();
    await expect(page.getByText(String(StatusCodes.NOT_FOUND))).toBeVisible();

    await page.getByRole('link', {name: 'Go to the home page'}).click();

    await expect(page).toHaveURL(/\/configure$/);
    await expect(page.getByRole('heading', {name: 'Sorry!'})).toHaveCount(0);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(
      page.getByRole('main').getByRole('heading', {level: 1}),
    ).toBeVisible();
  });
});
