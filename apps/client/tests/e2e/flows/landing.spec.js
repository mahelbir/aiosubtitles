import {StatusCodes} from 'http-status-codes';
import {DEFAULT_LOCALE} from '@repo/shared/constants/app.js';
import {getFailedPagePattern} from '../lib/api.js';
import {MISSING_PAGE_PATH} from '../lib/not-found.js';
import {expect, test} from '../lib/test.js';

test.describe('landing', () => {
  test('the landing route answers with its empty shell in the app locale', async ({
    page,
  }) => {
    const response = await page.goto('/');

    expect(response.status()).toBe(StatusCodes.OK);
    await expect(page.locator('html')).toHaveAttribute('lang', DEFAULT_LOCALE);
    await expect(page).toHaveTitle('');
    await expect(page.getByRole('main')).toHaveCount(0);
    await expect(page.getByRole('heading')).toHaveCount(0);
  });

  test.describe('an unknown URL', () => {
    test.use({
      allowedConsoleError: getFailedPagePattern({
        [MISSING_PAGE_PATH]: [StatusCodes.NOT_FOUND],
      }),
    });

    test('renders the global not-found page, whose action leads home', async ({
      page,
    }) => {
      const response = await page.goto(MISSING_PAGE_PATH);

      expect(response.status()).toBe(StatusCodes.NOT_FOUND);
      await expect(page).toHaveTitle('Page not found');
      await expect(page.getByRole('heading', {name: 'Sorry!'})).toBeVisible();
      await expect(
        page.getByText('The page you are looking for was not found.'),
      ).toBeVisible();
      await expect(page.getByText(String(StatusCodes.NOT_FOUND))).toBeVisible();

      await page.getByRole('link', {name: 'Go to the home page'}).click();

      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('heading')).toHaveCount(0);
    });
  });
});
