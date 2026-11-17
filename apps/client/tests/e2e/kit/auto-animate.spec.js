import {openFixture} from '../lib/fixture-page.js';
import {clickButton} from '../lib/page.js';
import {expect, test} from '../lib/test.js';

function trackObservers(page) {
  return page.addInitScript(() => {
    const live = new Map();
    const NativeObserver = window.MutationObserver;
    window.MutationObserver = class extends NativeObserver {
      observe(target, options) {
        super.observe(target, options);
        live.set(this, (live.get(this) ?? new Set()).add(target));
      }

      disconnect() {
        super.disconnect();
        live.delete(this);
      }
    };
    window.__countObservers = selector =>
      [...live.values()].filter(targets =>
        [...targets].some(target => target.matches?.(selector)),
      ).length;
  });
}

function countListObservers(page) {
  return page.evaluate(() =>
    window.__countObservers('ul[aria-label="Öğeler"]'),
  );
}

function getList(page) {
  return page.getByRole('list', {name: 'Öğeler'});
}

test.describe('auto animate', () => {
  test.beforeEach(({page}) => trackObservers(page));

  test('watches the list with one observer although strict mode attaches its ref twice', async ({
    page,
  }) => {
    await openFixture(page, 'auto-animate');
    await expect(getList(page)).toBeVisible();

    expect(await countListObservers(page)).toBe(1);
  });

  test('frees its observer once the list unmounts', async ({page}) => {
    await openFixture(page, 'auto-animate');

    await clickButton(page, 'Listeyi gizle');

    await expect(getList(page)).toHaveCount(0);
    expect(await countListObservers(page)).toBe(0);
  });

  test('animates an added item in and resizes the list with the options it was given', async ({
    page,
  }) => {
    await openFixture(page, 'auto-animate');

    await clickButton(page, 'Öğe ekle');

    await expect
      .poll(() =>
        getList(page).evaluate(list => ({
          listDurations: list
            .getAnimations()
            .map(animation => animation.effect.getTiming().duration),
          isItemAnimated: list.lastElementChild.getAnimations().length > 0,
        })),
      )
      .toEqual({listDurations: [1000], isItemAnimated: true});
  });

  test('takes a plugin in place of options', async ({page}) => {
    await openFixture(page, 'auto-animate', {isPlugin: true});

    await clickButton(page, 'Öğe ekle');

    await expect
      .poll(() =>
        getList(page).evaluate(list =>
          list.lastElementChild
            .getAnimations()
            .map(animation => animation.effect.getTiming().duration),
        ),
      )
      .toEqual([700]);
  });

  test('a plugin stays still under reduced motion', async ({page}) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await openFixture(page, 'auto-animate', {isPlugin: true});

    await clickButton(page, 'Öğe ekle');

    const item = getList(page).getByText('Öğe 3');
    await expect(item).toBeVisible();
    expect(await item.evaluate(node => node.getAnimations().length)).toBe(0);
  });
});
