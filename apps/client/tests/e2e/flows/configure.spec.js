import {randomUUID} from 'node:crypto';
import {StatusCodes} from 'http-status-codes';
import {gotoWithQuery} from '../lib/page.js';
import {expect, test} from '../lib/test.js';

test.describe('configure', () => {
  test('the page opened for a stored config shows its id', async ({page}) => {
    const userConfigId = randomUUID();

    const response = await gotoWithQuery(page, '/configure', {userConfigId});

    expect(response.status()).toBe(StatusCodes.OK);
    await expect(page.getByRole('heading', {level: 1})).toBeVisible();
    await expect(
      page.getByText(`Configuration ${userConfigId}`, {exact: true}),
    ).toBeVisible();
  });
});
