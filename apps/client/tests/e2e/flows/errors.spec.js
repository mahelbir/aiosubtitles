import {StatusCodes} from 'http-status-codes';
import {DEFAULT_LOCALE} from '@repo/shared/constants/app.js';
import {
  getApiUrl,
  getFailedPagePattern,
  getSuccessEnvelope,
  stubApi,
} from '../lib/api.js';
import {getUserMenu} from '../lib/auth.js';
import {MISSING_PAGE_PATH} from '../lib/not-found.js';
import {clickButton} from '../lib/page.js';
import {expect, test} from '../lib/test.js';

const MISSING_ADMIN_PATH = `/admin${MISSING_PAGE_PATH}`;
const SETTINGS_PATH = '/settings';
const OFFLINE_FAILURE = 'net::ERR_INTERNET_DISCONNECTED';
const DEV_OVERLAY_FAILURES = {
  '/__nextjs_original-stack-frames': [OFFLINE_FAILURE],
  '/__nextjs_font/geist-latin.woff2': [OFFLINE_FAILURE],
};
const SETTINGS_CRASH_PATTERN =
  /^%o\n\n%s TypeError: Cannot convert undefined or null to object\n {4}at Object\.hasOwn \(<anonymous>\)\n {4}at pick \(/;

function matchAny(...patterns) {
  return new RegExp(patterns.map(({source}) => `(?:${source})`).join('|'));
}

function getCrashHeading(page) {
  return page.getByRole('heading', {level: 1, name: 'Hay aksi!'});
}

async function openCrashingSettings(page) {
  const crashes = [];
  page.on('console', message => {
    if (SETTINGS_CRASH_PATTERN.test(message.text())) {
      crashes.push(message.text());
    }
  });
  await stubApi(page, getApiUrl(SETTINGS_PATH), () => ({
    json: getSuccessEnvelope(null),
  }));
  await page.goto('/admin/settings');
  await expect(getCrashHeading(page)).toBeVisible();
  return crashes;
}

test.describe('an unknown admin URL', () => {
  test.use({
    allowedConsoleError: getFailedPagePattern({
      [MISSING_PAGE_PATH]: [StatusCodes.NOT_FOUND],
      [MISSING_ADMIN_PATH]: [StatusCodes.NOT_FOUND],
    }),
  });

  test('renders the same global not-found page as any unknown URL, without the panel', async ({
    page,
  }) => {
    await page.goto(MISSING_PAGE_PATH);
    const notFoundTitle = await page.title();
    const notFoundPage = await page.locator('body').ariaSnapshot();

    const response = await page.goto(MISSING_ADMIN_PATH);

    expect(response.status()).toBe(StatusCodes.NOT_FOUND);
    await expect(page.locator('html')).toHaveAttribute('lang', DEFAULT_LOCALE);
    await expect(page).toHaveTitle(notFoundTitle);
    await expect(page.locator('body')).toMatchAriaSnapshot(notFoundPage);
    await expect(getUserMenu(page)).toHaveCount(0);
  });
});

test.describe('a panel page that fails to render', () => {
  test.use({allowedConsoleError: SETTINGS_CRASH_PATTERN});

  test('shows the panel error page inside the panel chrome, and a retry fetches the page’s data again', async ({
    page,
  }) => {
    const crashes = await openCrashingSettings(page);

    await expect(page.getByRole('main')).toMatchAriaSnapshot(`
      - paragraph: "${StatusCodes.INTERNAL_SERVER_ERROR}"
      - heading "Hay aksi!" [level=1]
      - paragraph: Beklenmeyen bir hata oluştu.
      - button "Tekrar dene"
    `);
    await expect(getUserMenu(page)).toBeVisible();
    await expect(page.getByRole('link', {name: 'Ayarlar'})).toBeVisible();
    await expect.poll(() => crashes.length).toBe(1);

    await page.unroute(getApiUrl(SETTINGS_PATH));
    await clickButton(page, 'Tekrar dene');

    await expect(
      page.getByRole('textbox', {name: 'Uygulama Adı'}),
    ).toBeVisible();
    await expect(getCrashHeading(page)).toHaveCount(0);
    expect(crashes).toHaveLength(1);
  });

  test.describe('while offline', () => {
    test.use({
      allowedConsoleError: matchAny(
        SETTINGS_CRASH_PATTERN,
        getFailedPagePattern(DEV_OVERLAY_FAILURES),
      ),
    });

    test('says the page cannot load while offline, and back online the error returns', async ({
      page,
      context,
    }) => {
      await openCrashingSettings(page);

      await context.setOffline(true);

      await expect(page.getByRole('main')).toMatchAriaSnapshot(`
        - paragraph: "${StatusCodes.SERVICE_UNAVAILABLE}"
        - heading "Bağlantı yok" [level=1]
        - paragraph: Bu sayfa yüklenemedi. Çevrimiçi olunca tekrar deneyin.
        - button "Tekrar dene"
      `);

      await context.setOffline(false);

      await expect(getCrashHeading(page)).toBeVisible();
    });
  });
});
