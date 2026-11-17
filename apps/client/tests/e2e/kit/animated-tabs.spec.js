import {expectFixtureState, openFixture} from '../lib/fixture-page.js';
import {getTab, getTabPanel} from '../lib/locators.js';
import {
  clickButton,
  readBoxes,
  recordBoxes,
  settleAnimatedPositions,
} from '../lib/page.js';
import {expect, test} from '../lib/test.js';

const FIXTURE = '[data-testid="fixture"]';
const PANEL_CONTENT = `${FIXTURE} [role="tabpanel"] > *`;
const INDICATOR = '[data-slot="animated-tabs-indicator"]';
const SECOND_GROUP_INDICATOR = `${FIXTURE} section:nth-of-type(2) ${INDICATOR}`;
const ACTIVE_LABEL = `${FIXTURE} [role="tab"][aria-selected="true"] > span:has(> span)`;
const ARCHIVE_BADGE = `${FIXTURE} [role="tab"]:nth-of-type(2) > span:last-child`;
const SLIDE_THRESHOLD = 8;

function getTabs(page) {
  return page.getByRole('region', {name: 'Sekmeler'});
}

function sampleStyle({selector, property}) {
  const id = (window.__samplerId ?? 0) + 1;
  window.__samplerId = id;
  window.__samples = [];
  const sample = () => {
    if (window.__samplerId !== id) {
      return;
    }
    const element = document.querySelector(selector);
    if (element) {
      const style = getComputedStyle(element);
      window.__samples.push(
        property === 'scale'
          ? new DOMMatrix(style.transform).a
          : Number(style.opacity),
      );
    }
    window.requestAnimationFrame(sample);
  };
  window.requestAnimationFrame(sample);
}

function recordStyle(page, selector, property) {
  return page.evaluate(sampleStyle, {selector, property});
}

function readSamples(page) {
  return page.evaluate(() => window.__samples);
}

function hasFade(opacities) {
  return opacities.some(opacity => opacity > 0.05 && opacity < 0.95);
}

async function readSlide(page) {
  const [panelBox, boxes] = await Promise.all([
    getTabs(page).getByRole('tabpanel').boundingBox(),
    readBoxes(page, PANEL_CONTENT),
  ]);
  const center = panelBox.x + panelBox.width / 2;
  const visibleBoxes = boxes.filter(box => box.opacity > 0.05);
  const sides = visibleBoxes.map(box => {
    const offset = box.left + box.width / 2 - center;
    if (offset < -SLIDE_THRESHOLD) {
      return 'left';
    }
    return offset > SLIDE_THRESHOLD ? 'right' : 'center';
  });
  return sides.filter((side, index) => side !== sides[index - 1]);
}

async function switchTab(page, name) {
  await recordBoxes(page, PANEL_CONTENT);
  await getTab(page, name).click();
  await expect(getTabPanel(page, name)).toHaveText(`${name} içeriği`);
}

test.describe('animated tabs', () => {
  test('labels the panel with the active tab and links the tab to it', async ({
    page,
  }) => {
    await openFixture(page, 'animated-tabs');
    const tab = getTab(page, 'Gelen');
    const panel = getTabPanel(page, 'Gelen');

    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(panel).toHaveText('Gelen içeriği');
    await expect(tab).toHaveAttribute(
      'aria-controls',
      await panel.getAttribute('id'),
    );
  });

  test('shows the chosen tab’s panel and reports the change', async ({
    page,
  }) => {
    await openFixture(page, 'animated-tabs');

    await getTab(page, 'Arşiv').click();

    await expect(getTabPanel(page, 'Arşiv')).toHaveText('Arşiv içeriği');
    await expect(page.getByText('Gelen içeriği')).toHaveCount(0);
    await expectFixtureState(page).toEqual({
      changes: ['archive'],
      value: 'archive',
    });
  });

  test('renders no panel when the value matches no item', async ({page}) => {
    await openFixture(page, 'animated-tabs', {value: 'missing'});

    await expect(getTabs(page).getByRole('tablist')).toBeVisible();
    await expect(getTabs(page).getByRole('tabpanel')).toHaveCount(0);
  });

  test('leaves room around the content for a full-width child’s ring', async ({
    page,
  }) => {
    await openFixture(page, 'animated-tabs');
    const [listBox, panelBox, contentBox] = await Promise.all([
      getTabs(page).getByRole('tablist').boundingBox(),
      getTabs(page).getByRole('tabpanel').boundingBox(),
      page.getByText('Gelen içeriği').boundingBox(),
    ]);

    expect(Math.abs(contentBox.x - listBox.x)).toBeLessThan(1);
    expect(contentBox.x - panelBox.x).toBeGreaterThanOrEqual(3);
    expect(
      panelBox.x + panelBox.width - (contentBox.x + contentBox.width),
    ).toBeGreaterThanOrEqual(3);
  });

  test('slides the content out and the next one in from the side of the chosen tab', async ({
    page,
  }) => {
    await openFixture(page, 'animated-tabs');

    await switchTab(page, 'Taslaklar');
    await expect
      .poll(() => readSlide(page))
      .toEqual(['center', 'left', 'right', 'center']);

    await switchTab(page, 'Gelen');
    await expect
      .poll(() => readSlide(page))
      .toEqual(['center', 'right', 'left', 'center']);
  });

  test('swaps the content at once when the user prefers reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await openFixture(page, 'animated-tabs');
    await recordStyle(page, PANEL_CONTENT, 'opacity');

    await switchTab(page, 'Taslaklar');
    await settleAnimatedPositions(page);

    expect(await readSlide(page)).toEqual(['center']);
    expect(hasFade(await readSamples(page))).toBe(false);
  });

  test('glides the indicator from the previous tab to the chosen one', async ({
    page,
  }) => {
    await openFixture(page, 'animated-tabs');
    const [fromBox, toBox] = await Promise.all([
      getTab(page, 'Gelen').boundingBox(),
      getTab(page, 'Taslaklar').boundingBox(),
    ]);
    await recordBoxes(page, INDICATOR);

    await getTab(page, 'Taslaklar').click();

    await expect(getTab(page, 'Taslaklar').locator(INDICATOR)).toHaveCount(1);
    await expect(getTab(page, 'Gelen').locator(INDICATOR)).toHaveCount(0);
    await settleAnimatedPositions(page);
    const lefts = (await readBoxes(page, INDICATOR)).map(box => box.left);
    expect(Math.abs(lefts[0] - fromBox.x)).toBeLessThan(1);
    expect(Math.abs(lefts.at(-1) - toBox.x)).toBeLessThan(1);
    const inBetween = new Set(
      lefts.filter(left => left > fromBox.x + 1 && left < toBox.x - 1),
    );
    expect(inBetween.size).toBeGreaterThanOrEqual(3);
  });

  test('keeps the indicator of another tab group in place', async ({page}) => {
    await openFixture(page, 'animated-tabs');
    await recordBoxes(page, SECOND_GROUP_INDICATOR);

    await getTab(page, 'Taslaklar').click();
    await settleAnimatedPositions(page);

    const lefts = (await readBoxes(page, SECOND_GROUP_INDICATOR)).map(
      box => box.left,
    );
    expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThan(1);
  });

  test('shows the active label at full size on the first paint', async ({
    page,
  }) => {
    await page.addInitScript(sampleStyle, {
      selector: ACTIVE_LABEL,
      property: 'scale',
    });
    await openFixture(page, 'animated-tabs');
    await settleAnimatedPositions(page);

    expect(Math.min(...(await readSamples(page)))).toBeGreaterThan(0.99);
  });

  test('pops the label of the chosen tab', async ({page}) => {
    await openFixture(page, 'animated-tabs');
    await recordStyle(page, ACTIVE_LABEL, 'scale');

    await getTab(page, 'Taslaklar').click();
    await settleAnimatedPositions(page);

    expect(Math.min(...(await readSamples(page)))).toBeLessThan(0.95);
  });

  test('replaces the badge with its new count', async ({page}) => {
    await openFixture(page, 'animated-tabs');
    await expect(getTab(page, 'Gelen')).toHaveAccessibleName('Gelen 2');

    await clickButton(page, 'Rozeti artır');

    await expect(getTab(page, 'Gelen')).toHaveAccessibleName('Gelen 3');
  });

  test('fades a badge in when it appears and out when it goes', async ({
    page,
  }) => {
    await openFixture(page, 'animated-tabs');

    await recordStyle(page, ARCHIVE_BADGE, 'opacity');
    await clickButton(page, 'Arşiv rozetini değiştir');
    await expect(getTab(page, 'Arşiv')).toHaveAccessibleName('Arşiv 5');
    await settleAnimatedPositions(page);
    expect(hasFade(await readSamples(page))).toBe(true);

    await recordStyle(page, ARCHIVE_BADGE, 'opacity');
    await clickButton(page, 'Arşiv rozetini değiştir');
    await expect(getTab(page, 'Arşiv')).toHaveAccessibleName('Arşiv');
    expect(hasFade(await readSamples(page))).toBe(true);
  });

  test('keeps a disabled item out of reach', async ({page}) => {
    await openFixture(page, 'animated-tabs');
    const tab = getTab(page, 'İstenmeyen');

    await expect(tab).toBeDisabled();
    await tab.click({force: true});

    await expect(getTab(page, 'Gelen')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expectFixtureState(page).toEqual({changes: [], value: 'inbox'});
  });
});
