import {expect} from './test.js';

export const REFETCH_FAILURE_TOAST = 'Veriler güncellenemedi.';

export function getToasts(page) {
  return page.getByRole('region', {name: /^Notifications/}).getByRole('alert');
}

export async function expectToasts(page, texts) {
  await Promise.all(
    texts.map(text =>
      expect(getToasts(page).filter({hasText: text}).first()).toBeVisible(),
    ),
  );
  expect(await getToasts(page).allTextContents(), 'Unexpected toasts.').toEqual(
    texts,
  );
}
