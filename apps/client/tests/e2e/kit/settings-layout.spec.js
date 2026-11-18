import {StatusCodes} from 'http-status-codes';
import {
  getOfflineBanner,
  getSaveButton,
  getSectionPicker,
  getVisibleText,
} from '../lib/locators.js';
import {
  expectFixtureState,
  openFixture,
  readDigest,
} from '../lib/fixture-page.js';
import {expect, test} from '../lib/test.js';
import {TALL_PHONE_VIEWPORT} from '../lib/viewport.js';

const FIXTURE = 'settings-layout';
const DESKTOP_VIEWPORT = Object.freeze({width: 1280, height: 800});
const SECTION_LABELS = ['Sources', 'Languages', 'Install'];
const UNSAVED_TEXT = 'You have unsaved changes';
const INDICATOR_SLOT = 'settings-nav-indicator';
const REDUCED_MOTION_MAX_SECONDS = 0.0001;

function getNav(page) {
  return page.getByRole('navigation', {name: 'Settings sections'});
}

function getNavItem(page, label) {
  return getNav(page).getByRole('button', {name: label, exact: true});
}

function getPreviousButton(page) {
  return page.getByRole('button', {name: /^Previous/});
}

function getNextButton(page) {
  return page.getByRole('button', {name: /^Next/});
}

function getVisibleSaveButton(page) {
  return getSaveButton(page).filter({visible: true});
}

function getUnsavedNotice(page) {
  return page.getByText(UNSAVED_TEXT).filter({visible: true});
}

function findIndicator(elements) {
  return elements.find(element => element.slot === INDICATOR_SLOT);
}

async function readIndicator(page) {
  const {elements} = await readDigest(page);
  return findIndicator(elements);
}

async function readIndicatorTransition(page) {
  return (await readIndicator(page))?.style.transitionDuration;
}

async function readIndicatorOffset(page, label) {
  const {elements} = await readDigest(page);
  const indicator = findIndicator(elements);
  const item = elements.find(
    element => element.tag === 'button' && element.text === label,
  );
  return indicator && item ? indicator.box.y - item.box.y : null;
}

function getBorderColor(border) {
  return border.split(' ').slice(2).join(' ');
}

function toRgba(page, colors) {
  return page.evaluate(
    values =>
      values.map(value => {
        const context = new OffscreenCanvas(1, 1).getContext('2d');
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data];
      }),
    colors,
  );
}

test.describe('settings layout', () => {
  test.describe('on a desktop', () => {
    test.use({viewport: DESKTOP_VIEWPORT});

    test('the nav lists every section in order', async ({page}) => {
      await openFixture(page, FIXTURE);

      await expect(
        getNav(page).getByRole('button', {
          name: new RegExp(`^(${SECTION_LABELS.join('|')})$`),
        }),
      ).toHaveText(SECTION_LABELS);
    });

    test('the first section is the current page', async ({page}) => {
      await openFixture(page, FIXTURE);

      await expect(getNavItem(page, 'Sources')).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(getNavItem(page, 'Languages')).not.toHaveAttribute(
        'aria-current',
      );
    });

    test('a click on a section makes it active', async ({page}) => {
      await openFixture(page, FIXTURE);
      await expect(getNavItem(page, 'Languages')).toBeEnabled();

      await getNavItem(page, 'Languages').click();

      await expectFixtureState(page, 'activeSection').toBe('languages');
      await expect(getNavItem(page, 'Languages')).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(getNavItem(page, 'Sources')).not.toHaveAttribute(
        'aria-current',
      );
    });

    test('a clean form shows the save button without the unsaved notice', async ({
      page,
    }) => {
      await openFixture(page, FIXTURE);

      await expect(getVisibleSaveButton(page)).toBeVisible();
      await expect(getUnsavedNotice(page)).toHaveCount(0);
    });

    test('a clean form says it is saved, or shows the text the screen passes', async ({
      page,
    }) => {
      await openFixture(page, FIXTURE);
      await expect(getVisibleText(page, 'All changes saved')).toBeVisible();

      await openFixture(page, FIXTURE, {unsaved: 1});

      await expect(getVisibleText(page, 'Not saved yet')).toBeVisible();
      await expect(page.getByText('All changes saved')).toHaveCount(0);
    });

    test('a dirty form shows the unsaved notice and saves on click', async ({
      page,
    }) => {
      await openFixture(page, FIXTURE, {dirty: 1});

      await expect(getUnsavedNotice(page)).toBeVisible();
      await getVisibleSaveButton(page).click();

      await expectFixtureState(page, 'saveCount').toBe(1);
    });

    test('the active indicator sits on the active item', async ({page}) => {
      await openFixture(page, FIXTURE);
      await expect.poll(() => readIndicatorOffset(page, 'Sources')).toBe(0);

      await getNavItem(page, 'Install').click();

      await expect.poll(() => readIndicatorOffset(page, 'Install')).toBe(0);
    });

    test('the active indicator border differs from its fill', async ({
      page,
    }) => {
      await openFixture(page, FIXTURE);

      const {style} = await readIndicator(page);
      const [border, fill] = await toRgba(page, [
        getBorderColor(style.border),
        style.backgroundColor,
      ]);
      expect(border[3]).toBeGreaterThan(0);
      expect(border).not.toEqual(fill);
    });

    test('the active indicator moves with a transition', async ({page}) => {
      await openFixture(page, FIXTURE);

      await expect
        .poll(() => readIndicatorTransition(page))
        .toMatch(/^(?!0s$)\d/);
    });

    test.describe('under reduced motion', () => {
      test.use({reducedMotion: 'reduce'});

      test('the active indicator does not transition', async ({page}) => {
        await openFixture(page, FIXTURE);

        await expect
          .poll(async () =>
            Number.parseFloat(await readIndicatorTransition(page)),
          )
          .toBeLessThanOrEqual(REDUCED_MOTION_MAX_SECONDS);
      });
    });
  });

  test.describe('on a phone', () => {
    test.use({viewport: TALL_PHONE_VIEWPORT});

    test('a section picker replaces the nav', async ({page}) => {
      await openFixture(page, FIXTURE);

      await expect(getSectionPicker(page)).toHaveText('Sources');
      await expect(getNav(page)).toBeHidden();
    });

    test('previous is disabled on the first section and next moves on', async ({
      page,
    }) => {
      await openFixture(page, FIXTURE);

      await expect(getPreviousButton(page)).toBeDisabled();
      await getNextButton(page).click();

      await expectFixtureState(page, 'activeSection').toBe('languages');
      await expect(getSectionPicker(page)).toHaveText('Languages');
      await expect(getPreviousButton(page)).toBeEnabled();
    });

    test('next is disabled on the last section', async ({page}) => {
      await openFixture(page, FIXTURE);
      await expect(getNextButton(page)).toBeEnabled();

      await getNextButton(page).click();
      await expectFixtureState(page, 'activeSection').toBe('languages');
      await getNextButton(page).click();

      await expectFixtureState(page, 'activeSection').toBe('install');
      await expect(getNextButton(page)).toBeDisabled();
    });

    test('a clean form has no save bar', async ({page}) => {
      await openFixture(page, FIXTURE);

      await expect(getSectionPicker(page)).toBeVisible();
      await expect(getVisibleSaveButton(page)).toHaveCount(0);
    });

    test('a dirty form shows a save bar on the bottom edge', async ({page}) => {
      await openFixture(page, FIXTURE, {dirty: 1});

      const saveButton = getVisibleSaveButton(page);
      await expect(saveButton).toBeVisible();
      await expect(saveButton).toBeInViewport();
      const box = await saveButton.boundingBox();
      expect(box.y).toBeGreaterThan(TALL_PHONE_VIEWPORT.height / 2);

      await saveButton.click();

      await expectFixtureState(page, 'saveCount').toBe(1);
    });

    test('a clean form shows the text the screen passes', async ({page}) => {
      await openFixture(page, FIXTURE, {unsaved: 1});

      await expect(getVisibleText(page, 'Not saved yet')).toBeVisible();
    });

    test('the offline banner sits above the save bar', async ({
      page,
      context,
    }) => {
      await openFixture(page, FIXTURE, {dirty: 1});
      const saveButton = getVisibleSaveButton(page);
      await expect(saveButton).toBeVisible();

      await context.setOffline(true);

      const banner = getOfflineBanner(page);
      await expect(banner).toBeVisible();
      const [bannerBox, saveButtonBox] = await Promise.all([
        banner.boundingBox(),
        saveButton.boundingBox(),
      ]);
      expect(bannerBox.y + bannerBox.height).toBeLessThan(saveButtonBox.y);
      await context.setOffline(false);
    });

    test('the offline banner keeps its place without a save bar', async ({
      page,
      context,
    }) => {
      await openFixture(page, FIXTURE);

      await context.setOffline(true);

      const banner = getOfflineBanner(page);
      await expect(banner).toBeVisible();
      const bannerBox = await banner.boundingBox();
      expect(bannerBox.y + bannerBox.height).toBeGreaterThan(
        TALL_PHONE_VIEWPORT.height * 0.9,
      );
      await context.setOffline(false);
    });
  });

  test('the client serves its icon and a favicon', async ({page}) => {
    await openFixture(page, FIXTURE);
    const iconLink = page.locator('link[rel="icon"]').first();
    await expect(iconLink).toHaveAttribute('href', /.+/);
    const iconHref = await iconLink.getAttribute('href');

    const [favicon, icon] = await Promise.all([
      page.request.get('/favicon.ico'),
      page.request.get(iconHref),
    ]);

    expect(favicon.status()).toBe(StatusCodes.OK);
    expect(icon.status()).toBe(StatusCodes.OK);
  });
});
