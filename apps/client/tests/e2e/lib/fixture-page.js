import {gotoWithQuery} from './page.js';
import {expect} from './test.js';

export const SETTLED_ERROR = Object.freeze({
  status: 'error',
  fetchStatus: 'idle',
});

export const DIALOG_SELECTOR = '[role="dialog"]';

export const PUBLIC_FIXTURES_PATH = '/fixtures';

export async function openFixture(page, name, searchParams) {
  await gotoWithQuery(page, `${PUBLIC_FIXTURES_PATH}/${name}`, searchParams);
  await page
    .locator(
      `[data-testid="fixture"][data-fixture="${name}"]:not([aria-busy="true"])`,
    )
    .waitFor();
}

export function readFixtureState(page) {
  return page
    .evaluate(() => window.__fixture?.state())
    .catch(error => {
      if (error.message.includes('Execution context was destroyed')) {
        return undefined;
      }
      throw error;
    });
}

export function expectFixtureState(page, key) {
  return expect.poll(async () => {
    const state = await readFixtureState(page);
    return key === undefined ? state : state?.[key];
  });
}

export async function goOffline(page) {
  await page.context().setOffline(true);
  await expectFixtureState(page).toMatchObject({isOnline: false});
}

export function readDigest(page, selector = '[data-testid="fixture"]') {
  return page.evaluate(root => window.__fixture.digest(root), selector);
}

export function expectDialogSlot(page) {
  return expect.poll(
    async () => (await readDigest(page, DIALOG_SELECTOR))?.elements[0]?.slot,
  );
}
