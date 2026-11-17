import {StatusCodes} from 'http-status-codes';
import {getApiUrl, getSuccessEnvelope, stubApi} from './api.js';
import {expectFixtureState, openFixture} from './fixture-page.js';

export const ENTRY = {id: 41};

export const SERVER_MESSAGE = 'Kayıt eklendi.';

export function stubEntries(
  page,
  {
    status = StatusCodes.OK,
    json = getSuccessEnvelope(ENTRY, SERVER_MESSAGE),
    until,
  } = {},
) {
  return stubApi(page, getApiUrl('/fixtures/entries'), async () => {
    await until;
    return {status, json};
  });
}

export async function openAlerts(page, open = openFixture) {
  await open(page, 'alerts');
  await expectFixtureState(page).toMatchObject({ledger: {fetchCount: 1}});
}
