import {
  expectFixtureState,
  goOffline,
  openFixture,
} from '../lib/fixture-page.js';
import {
  OFFLINE_BANNER_TEXT,
  getOfflineBanner,
  getOfflineNotice,
} from '../lib/locators.js';
import {expect, test} from '../lib/test.js';

const OFFLINE_DEBOUNCE_MS = 800;

function getFeed(page) {
  return page.getByRole('region', {name: 'Akış'});
}

function watchBannerTimeline(page) {
  return page.evaluateHandle(text => {
    const timeline = {offlineAt: null, shownAt: null};
    const observer = new MutationObserver(() => {
      const isShown = [...document.querySelectorAll('[role="status"]')].some(
        element => element.textContent.includes(text),
      );
      if (isShown) {
        timeline.shownAt = performance.now();
        observer.disconnect();
      }
    });
    window.addEventListener(
      'offline',
      () => {
        timeline.offlineAt = performance.now();
      },
      {once: true},
    );
    observer.observe(document.body, {childList: true, subtree: true});
    return timeline;
  }, OFFLINE_BANNER_TEXT);
}

test.describe('connectivity', () => {
  test.beforeEach(async ({page}) => {
    await openFixture(page, 'connectivity');
    await expectFixtureState(page).toMatchObject({isOnline: true});
  });

  test('going offline flips useIsOnline at once and announces the banner once OFFLINE_DEBOUNCE_MS of components/common/offline-banner.js has passed', async ({
    page,
    context,
  }) => {
    const timeline = await watchBannerTimeline(page);

    await context.setOffline(true);

    await expectFixtureState(page).toMatchObject({isOnline: false});
    await expect(getOfflineBanner(page)).toBeVisible();
    const {offlineAt, shownAt} = await timeline.jsonValue();
    expect({offlineAt, shownAt}).toEqual({
      offlineAt: expect.any(Number),
      shownAt: expect.any(Number),
    });
    expect(shownAt - offlineAt).toBeGreaterThanOrEqual(OFFLINE_DEBOUNCE_MS);

    await context.setOffline(false);

    await expectFixtureState(page).toMatchObject({isOnline: true});
    await expect(getOfflineBanner(page)).toHaveCount(0);
  });

  test('an offline blip shorter than the debounce never shows the banner', async ({
    page,
    context,
  }) => {
    await goOffline(page);
    await context.setOffline(false);
    await expectFixtureState(page).toMatchObject({isOnline: true});

    await page.waitForTimeout(OFFLINE_DEBOUNCE_MS);

    expect(await getOfflineBanner(page).count()).toBe(0);
  });

  test('a query started offline pauses behind the offline notice and resumes once back online', async ({
    page,
    context,
  }) => {
    await context.setOffline(true);
    await expect(getOfflineBanner(page)).toBeVisible();

    await getFeed(page).getByRole('button', {name: 'Akışı başlat'}).click();

    await expect(getOfflineNotice(getFeed(page))).toBeVisible();
    await expect(getFeed(page).getByText('Akış güncel.')).toHaveCount(0);
    await expectFixtureState(page).toMatchObject({
      feed: {status: 'pending', fetchStatus: 'paused'},
    });

    await context.setOffline(false);

    await expect(getFeed(page).getByText('Akış güncel.')).toBeVisible();
    await expect(getOfflineNotice(getFeed(page))).toHaveCount(0);
    await expectFixtureState(page).toMatchObject({
      isOnline: true,
      feed: {status: 'success', fetchStatus: 'idle'},
    });
    await expect(getOfflineBanner(page)).toHaveCount(0);
  });
});
