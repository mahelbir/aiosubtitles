import {escapeRegExp} from 'es-toolkit';
import {
  FIXTURE_RECORD_PATH,
  getApiUrl,
  getSuccessEnvelope,
  respondInSequence,
  stubApi,
} from '../lib/api.js';
import {expectFixtureState} from '../lib/fixture-page.js';
import {clickButton} from '../lib/page.js';
import {expect, test} from '../lib/test.js';

const RENDER_FAILURE = 'Kayıt okunamadı.';

test.describe('the app error page', () => {
  test.use({allowedConsoleError: new RegExp(escapeRegExp(RENDER_FAILURE))});

  test('its retry drops the data that broke the page and fetches it again', async ({
    page,
  }) => {
    const hits = await stubApi(
      page,
      getApiUrl(FIXTURE_RECORD_PATH),
      respondInSequence(
        {json: getSuccessEnvelope(null)},
        {json: getSuccessEnvelope({id: 1, name: 'Ada Yılmaz'})},
      ),
    );
    await page.goto('/admin/fixtures/app-error');
    await expect(page.getByRole('heading', {name: 'Hay aksi!'})).toBeVisible();

    await clickButton(page, 'Tekrar dene');

    await expectFixtureState(page).toEqual({name: 'Ada Yılmaz'});
    expect(hits).toHaveLength(2);
  });
});
