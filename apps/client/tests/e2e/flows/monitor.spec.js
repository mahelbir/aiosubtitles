import {getMonitorLevelSelect, getTopLoader} from '../lib/locators.js';
import {
  expectPageTitle,
  expectSearchParams,
  gotoWithQuery,
} from '../lib/page.js';
import {expect, test} from '../lib/test.js';
import {expectToasts} from '../lib/toasts.js';

const HEARTBEAT_QUERY = {scope: 'heartbeat', title: 'Heartbeat'};

function trackNamespaceAcks(page) {
  const acks = [];
  const isAck = payload => String(payload).includes('40/monitor,{"sid"');
  page.on('response', async response => {
    if (
      response.url().includes('/socket.io/') &&
      isAck(await response.text().catch(() => ''))
    ) {
      acks.push('polling');
    }
  });
  page.on('websocket', socket =>
    socket.on('framereceived', ({payload}) => {
      if (isAck(payload)) {
        acks.push('websocket');
      }
    }),
  );
  return acks;
}

test('the sidebar opens the heartbeat board, whose live stream connects', async ({
  page,
}) => {
  const acks = trackNamespaceAcks(page);
  await page.goto('/admin');

  await page.getByRole('button', {name: 'Monitör'}).click();
  await page.getByRole('link', {name: 'Heartbeat'}).click();

  await expectSearchParams(page).toEqual(HEARTBEAT_QUERY);
  await expectPageTitle(page, HEARTBEAT_QUERY.title);
  await expect(getMonitorLevelSelect(page)).toContainText('info');
  await expect.poll(() => acks.length).toBeGreaterThan(0);
  await expect(getTopLoader(page)).toHaveCount(0);
  await expectToasts(page, []);
});

test('the level filter writes the URL', async ({page}) => {
  await gotoWithQuery(page, '/admin/monitor', HEARTBEAT_QUERY);

  await getMonitorLevelSelect(page).click();
  await page.getByRole('option', {name: 'warn', exact: true}).click();

  await expectSearchParams(page).toEqual({...HEARTBEAT_QUERY, level: 'warn'});
  await expect(getMonitorLevelSelect(page)).toContainText('warn');
});

test('without a scope the board says what is missing', async ({page}) => {
  await page.goto('/admin/monitor');

  await expect(
    page.getByRole('alert').filter({hasText: 'Kapsam belirtilmedi.'}),
  ).toBeVisible();
  await expect(getMonitorLevelSelect(page)).toHaveCount(0);
});
