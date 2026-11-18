import {noop, pick} from 'es-toolkit';
import {
  DIALOG_SELECTOR,
  expectDialogSlot,
  expectFixtureState,
  goOffline,
  openFixture,
  readDigest,
} from '../lib/fixture-page.js';
import {
  BUSY_SELECTOR,
  getBusy,
  getCloseButton,
  getDialog,
  getField,
  getLoadingStatus,
  getOfflineNotice,
  getSaveButton,
  getTabPanel,
} from '../lib/locators.js';
import {
  clickButton,
  expectHeightsToGlide,
  expectSearchParams,
  readBoxes,
  recordBoxes,
  settleAnimations,
} from '../lib/page.js';
import {expect, test} from '../lib/test.js';
import {PHONE_VIEWPORT} from '../lib/viewport.js';

const LATENCY_MS = 800;
const HELD_LATENCY_MS = 60_000;

function openFormSkeletons(page, searchParams) {
  return openFixture(page, 'form-skeletons', searchParams);
}

function getCard(page) {
  return page.getByRole('region', {name: 'Kart'});
}

function getEditPanel(page) {
  return getDialog(page, 'Kayıt Düzenle');
}

function getGeneralTabPanel(page) {
  return getTabPanel(page, 'Genel');
}

function getSlotBox(digest, slot) {
  return digest.elements.find(element => element.slot === slot)?.box;
}

function getFooterGap(digest, footerSlot) {
  const body = getSlotBox(digest, 'field-group');
  return getSlotBox(digest, footerSlot).y - (body.y + body.h);
}

async function expectSkeleton(scope, getChecks = () => []) {
  const busy = getBusy(scope);
  await expect(busy).toBeVisible();
  await Promise.all([
    expect(scope.getByRole('textbox')).toHaveCount(0),
    expect(getSaveButton(scope)).toHaveCount(0),
    ...getChecks(busy),
  ]);
  await expect(busy).toBeVisible();
}

async function expectForm(scope, name, getChecks = () => []) {
  await expect(getField(scope, 'Ad')).toHaveValue(name);
  await Promise.all([
    expect(getSaveButton(scope)).toBeVisible(),
    expect(getBusy(scope)).toHaveCount(0),
    ...getChecks(),
  ]);
}

async function expectLoadingAnnounced(scope, name) {
  await expectSkeleton(scope, busy => [
    expect(getLoadingStatus(scope)).toHaveCount(1),
    expect(getLoadingStatus(busy)).toHaveCount(0),
  ]);
  await expectForm(scope, name, () => [
    expect(getLoadingStatus(scope)).toHaveCount(0),
  ]);
}

async function readTwins(page, {getScope, open = noop, read, searchParams}) {
  const readAt = async (delay, getReadyMark) => {
    await openFormSkeletons(page, {...searchParams, delay});
    await open(page);
    await expect(getReadyMark(getScope(page))).toBeVisible();
    await settleAnimations(getScope(page));
    return read(page);
  };
  const skeleton = await readAt(HELD_LATENCY_MS, getBusy);
  const form = await readAt(0, scope => getField(scope, 'Ad'));
  return {skeleton, form};
}

function openEditPanel(page) {
  return clickButton(page, 'Ada Yılmaz düzenle');
}

async function openLoadingEditPanel(page, searchParams) {
  await openFormSkeletons(page, {delay: LATENCY_MS, ...searchParams});
  await openEditPanel(page);
  return getEditPanel(page);
}

function getQuickEditDialog(page) {
  return getDialog(page, 'Hızlı Düzenle');
}

function openQuickEditDialog(page) {
  return clickButton(page, 'Ada Yılmaz hızlı düzenle');
}

function readDialogDigest(page) {
  return readDigest(page, DIALOG_SELECTOR);
}

function readQuickEditDialogTwins(page) {
  return readTwins(page, {
    getScope: getQuickEditDialog,
    open: openQuickEditDialog,
    read: readDialogDigest,
  });
}

function readEditPanelTwins(page, searchParams) {
  return readTwins(page, {
    getScope: getEditPanel,
    open: openEditPanel,
    read: readDialogDigest,
    searchParams,
  });
}

test.describe('page card form skeleton', () => {
  function readCardDigest(page) {
    return readDigest(page, 'section[aria-label="Kart"]');
  }

  function readCardTwins(page) {
    return readTwins(page, {getScope: getCard, read: readCardDigest});
  }

  function getCardFrame(digest) {
    return {
      width: digest.size.w,
      title: getSlotBox(digest, 'card-title'),
      footerHeight: getSlotBox(digest, 'card-footer').h,
    };
  }

  test('stands in for the card under its title and back link while the record loads, then the form takes its place', async ({
    page,
  }) => {
    await openFormSkeletons(page, {delay: LATENCY_MS});
    const card = getCard(page);

    await expectSkeleton(card, busy => [
      expect(busy.getByText('Profil kartı')).toBeVisible(),
      expect(busy.getByRole('link', {name: 'Go back'})).toHaveAttribute(
        'href',
        '/fixtures',
      ),
    ]);

    await expectForm(card, 'Cem Demir');
  });

  test('keeps the card width, its title box and its footer height when the form lands', async ({
    page,
  }) => {
    const {skeleton, form} = await readCardTwins(page);

    expect(getCardFrame(skeleton)).toEqual(getCardFrame(form));
  });

  test('keeps the card height when the form lands', async ({page}) => {
    const {skeleton, form} = await readCardTwins(page);

    expect(skeleton.size.h).toBe(form.size.h);
  });

  test('announces the load by role while the skeleton shows, and no longer once the form lands', async ({
    page,
  }) => {
    await openFormSkeletons(page, {delay: LATENCY_MS});

    await expectLoadingAnnounced(getCard(page), 'Cem Demir');
  });
});

test.describe('form panel skeleton', () => {
  test('stands in for the form inside the sheet while the record loads, with focus inside, then the form takes its place', async ({
    page,
  }) => {
    const panel = await openLoadingEditPanel(page);

    await expectSkeleton(panel, () => [
      expect(panel.getByRole('button', {name: 'Cancel'})).toHaveCount(0),
      expect(panel.locator(':focus')).toHaveCount(1),
    ]);

    await expectForm(panel, 'Ada Yılmaz', () => [
      expect(panel.getByRole('button', {name: 'Cancel'})).toBeVisible(),
      expect(panel.locator(':focus')).toHaveCount(1),
    ]);
  });

  test('announces the load by role while the skeleton shows, and no longer once the form lands', async ({
    page,
  }) => {
    const panel = await openLoadingEditPanel(page);

    await expectLoadingAnnounced(panel, 'Ada Yılmaz');
  });

  test('hands the focus from Close to the first field once the form lands, as a sheet opened on its form does', async ({
    page,
  }) => {
    const panel = await openLoadingEditPanel(page);

    await expectSkeleton(panel, () => [
      expect(getCloseButton(panel)).toBeFocused(),
    ]);

    await expectForm(panel, 'Ada Yılmaz', () => [
      expect(getField(panel, 'Ad')).toBeFocused(),
    ]);
  });

  test('leaves the focus where the user moved it while the record loads once the form lands', async ({
    page,
  }) => {
    const panel = await openLoadingEditPanel(page);
    await expect(getCloseButton(panel)).toBeFocused();

    await panel.getByRole('heading', {name: 'Kayıt Düzenle'}).click();

    await expectSkeleton(panel, () => [expect(panel).toBeFocused()]);
    await expectForm(panel, 'Ada Yılmaz', () => [expect(panel).toBeFocused()]);
  });

  test('hands the focus from Close into a leading group once the form lands', async ({
    page,
  }) => {
    const panel = await openLoadingEditPanel(page, {lead: 'group'});

    await expectSkeleton(panel, () => [
      expect(getCloseButton(panel)).toBeFocused(),
    ]);

    await expectForm(panel, 'Ada Yılmaz', () => [
      expect(
        panel.getByRole('button', {name: 'Üstüne', exact: true}),
      ).toBeFocused(),
    ]);
  });

  test('hands the focus from Close past a disabled leading field to the next one once the form lands', async ({
    page,
  }) => {
    const panel = await openLoadingEditPanel(page, {lead: 'disabled'});

    await expectSkeleton(panel, () => [
      expect(getCloseButton(panel)).toBeFocused(),
    ]);

    await expectForm(panel, 'Ada Yılmaz', () => [
      expect(getField(panel, 'Kimlik')).toBeDisabled(),
      expect(getField(panel, 'Ad')).toBeFocused(),
    ]);
  });

  test('Escape closes the sheet at once while the skeleton shows, without asking, and focus returns to the opener', async ({
    page,
  }) => {
    await openFormSkeletons(page, {delay: HELD_LATENCY_MS});
    const opener = page.getByRole('button', {
      name: 'Ada Yılmaz düzenle',
      exact: true,
    });
    await opener.focus();
    await page.keyboard.press('Enter');
    await expect(getBusy(getEditPanel(page))).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await Promise.all([
      expect(page.getByRole('alertdialog')).toHaveCount(0),
      expect(opener).toBeFocused(),
      expectSearchParams(page).toEqual({delay: String(HELD_LATENCY_MS)}),
    ]);
  });

  test('keeps the sheet footer at the position and height of the form footer', async ({
    page,
  }) => {
    const {skeleton, form} = await readEditPanelTwins(page);

    expect(getSlotBox(skeleton, 'sheet-footer')).toMatchObject(
      pick(getSlotBox(form, 'sheet-footer'), ['y', 'h']),
    );
  });

  test('a record opened offline shows the offline notice instead of the skeleton, then the form once back online', async ({
    page,
    context,
  }) => {
    await openFormSkeletons(page);
    await goOffline(page);

    await clickButton(page, 'Barış Kaya düzenle');
    const panel = getEditPanel(page);

    await expect(getOfflineNotice(panel)).toBeVisible();
    await Promise.all([
      expect(getBusy(panel)).toHaveCount(0),
      expectFixtureState(page).toMatchObject({
        panel: {status: 'pending', fetchStatus: 'paused'},
      }),
    ]);

    await context.setOffline(false);

    await expectForm(panel, 'Barış Kaya', () => [
      expect(getOfflineNotice(panel)).toHaveCount(0),
    ]);
  });

  test('inside a form dialog the skeleton takes the dialog footer, as tall as the form one', async ({
    page,
  }) => {
    const {skeleton, form} = await readQuickEditDialogTwins(page);

    expect(getSlotBox(skeleton, 'dialog-footer')?.h).toBe(
      getSlotBox(form, 'dialog-footer').h,
    );
  });

  test('keeps the gap above the dialog footer when the form lands', async ({
    page,
  }) => {
    const {skeleton, form} = await readQuickEditDialogTwins(page);

    expect(getFooterGap(skeleton, 'dialog-footer')).toBe(
      getFooterGap(form, 'dialog-footer'),
    );
  });

  test.describe('at a phone width', () => {
    test.use({viewport: PHONE_VIEWPORT});

    test('the skeleton fills the bottom drawer down to its own footer, then the form takes its place', async ({
      page,
    }) => {
      const panel = await openLoadingEditPanel(page);

      await expectSkeleton(panel, () => [
        expectDialogSlot(page).toBe('drawer-popup'),
        expect
          .poll(async () =>
            getSlotBox(
              await readDigest(page, `${DIALOG_SELECTOR} ${BUSY_SELECTOR}`),
              'drawer-footer',
            ),
          )
          .toBeDefined(),
      ]);

      await expectForm(panel, 'Ada Yılmaz');
    });

    test('keeps the gap above the drawer footer when the form lands', async ({
      page,
    }) => {
      const {skeleton, form} = await readEditPanelTwins(page);

      expect(getFooterGap(skeleton, 'drawer-footer')).toBe(
        getFooterGap(form, 'drawer-footer'),
      );
    });

    test('keeps the drawer height when a checkbox field lands', async ({
      page,
    }) => {
      const {skeleton, form} = await readEditPanelTwins(page, {
        lead: 'checkbox',
      });

      expect(skeleton.size.h).toBe(form.size.h);
    });

    test('glides the drawer when the form lands taller than its skeleton', async ({
      page,
    }) => {
      const panel = await openLoadingEditPanel(page, {lead: 'unmatched'});
      await expect(getBusy(panel)).toBeVisible();
      await recordBoxes(page, DIALOG_SELECTOR);

      await expect(getField(panel, 'Ad')).toBeVisible();
      await settleAnimations(panel);

      expectHeightsToGlide(await readBoxes(page, DIALOG_SELECTOR));
    });

    test('glides the drawer for a field that lands after the form while the field below it holds still', async ({
      page,
    }) => {
      const fieldBelow = `${DIALOG_SELECTOR} input[name="email"]`;
      const panel = await openLoadingEditPanel(page, {late: 1});
      await expect(getField(panel, 'Ad')).toBeVisible();
      await settleAnimations(panel);
      await recordBoxes(page, DIALOG_SELECTOR);
      await recordBoxes(page, fieldBelow);

      await expect(
        panel.getByRole('button', {name: 'Üstüne', exact: true}),
      ).toBeVisible();
      await settleAnimations(panel);

      const [panelBoxes, fieldBoxes] = await Promise.all([
        readBoxes(page, DIALOG_SELECTOR),
        readBoxes(page, fieldBelow),
      ]);
      expectHeightsToGlide(panelBoxes);
      const fieldTops = fieldBoxes.map(box => box.top);
      expect(Math.max(...fieldTops) - Math.min(...fieldTops)).toBeLessThan(2);
    });

    test('keeps the focus on the drawer itself once the form lands', async ({
      page,
    }) => {
      const panel = await openLoadingEditPanel(page);

      await expectSkeleton(panel, () => [expect(panel).toBeFocused()]);

      await expectForm(panel, 'Ada Yılmaz', () => [
        expect(panel).toBeFocused(),
      ]);
    });

    test('a drawer opened on an already loaded record keeps the focus on itself too', async ({
      page,
    }) => {
      await openFormSkeletons(page);
      await expect(getField(getCard(page), 'Ad')).toHaveValue('Cem Demir');

      await clickButton(page, 'Cem Demir düzenle');

      await expectForm(getEditPanel(page), 'Cem Demir', () => [
        expect(getEditPanel(page)).toBeFocused(),
      ]);
    });
  });
});

test.describe('tab menu panel skeleton', () => {
  function getGeneralHeading(scope) {
    return scope.getByRole('heading', {level: 2, name: 'Genel'});
  }

  async function readTabFrame(page) {
    const panel = getGeneralTabPanel(page);
    const [panelBox, headingBox, digest] = await Promise.all([
      panel.boundingBox(),
      getGeneralHeading(panel).boundingBox(),
      readDigest(page, '[role="tabpanel"]'),
    ]);
    return {
      headingY: headingBox.y - panelBox.y,
      footerHeight: getSlotBox(digest, 'card-footer').h,
    };
  }

  test('stands in for the tab panel under its heading while the record loads, then the form takes its place', async ({
    page,
  }) => {
    await openFormSkeletons(page, {delay: LATENCY_MS});
    const panel = getGeneralTabPanel(page);

    await expectSkeleton(panel, busy => [
      expect(getGeneralHeading(busy)).toBeVisible(),
    ]);

    await expectForm(panel, 'Cem Demir', () => [
      expect(getGeneralHeading(panel)).toBeVisible(),
    ]);
  });

  test('announces the load by role while the skeleton shows, and no longer once the form lands', async ({
    page,
  }) => {
    await openFormSkeletons(page, {delay: LATENCY_MS});

    await expectLoadingAnnounced(getGeneralTabPanel(page), 'Cem Demir');
  });

  test('another tab chosen from the keyboard while the first one loads shows its content and writes ?tab=', async ({
    page,
  }) => {
    await openFormSkeletons(page, {delay: HELD_LATENCY_MS});
    await expect(getBusy(getGeneralTabPanel(page))).toBeVisible();

    await page.getByRole('tab', {name: 'Genel'}).focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    await Promise.all([
      expect(
        getField(getTabPanel(page, 'Bildirimler'), 'Bildirim e-postası'),
      ).toBeVisible(),
      expectSearchParams(page).toEqual({
        delay: String(HELD_LATENCY_MS),
        tab: 'bildirim',
      }),
    ]);
  });

  test('keeps the tab heading position and the footer height when the form lands', async ({
    page,
  }) => {
    const {skeleton, form} = await readTwins(page, {
      getScope: getGeneralTabPanel,
      read: readTabFrame,
    });

    expect(skeleton).toEqual(form);
  });
});
