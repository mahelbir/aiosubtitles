import {
  SERVER_MESSAGE,
  openAlerts,
  stubEntries,
} from '../lib/alerts-fixture.js';
import {expectFixtureState, openPublicFixture} from '../lib/fixture-page.js';
import {getTopLoader} from '../lib/locators.js';
import {clickButton} from '../lib/page.js';
import {expect, test} from '../lib/test.js';
import {expectToasts} from '../lib/toasts.js';

test.describe('public root layout', () => {
  test.beforeEach(async ({page}) => {
    await openAlerts(page, openPublicFixture);
  });

  test('a confirm opens its alertdialog and resolves once answered', async ({
    page,
  }) => {
    await clickButton(page, 'Onay iste');

    const dialog = page.getByRole('alertdialog', {
      name: 'İşleme devam edilsin mi?',
    });
    await dialog.getByRole('button', {name: 'Onayla'}).click();

    await expect(dialog).toBeHidden();
    await expectFixtureState(page).toMatchObject({
      outcomes: {confirm: {status: 'fulfilled', value: true}},
    });
  });

  test('a pending mutation raises the top loader, then toasts the server message', async ({
    page,
  }) => {
    const {promise, resolve} = Promise.withResolvers();
    const hits = await stubEntries(page, {until: promise});

    await clickButton(page, 'Kaydet');

    await expect(getTopLoader(page)).toBeVisible();
    await expect.poll(() => hits).toHaveLength(1);

    resolve();

    await expectToasts(page, [SERVER_MESSAGE]);
    await expect(getTopLoader(page)).toHaveCount(0);
  });
});
