import {
  expectDialogSlot,
  expectFixtureState,
  openFixture,
  reloadFixture,
} from '../lib/fixture-page.js';
import {
  getCloseButton,
  getDialog,
  getSaveButton,
  getTab,
  getTabPanel,
} from '../lib/locators.js';
import {
  clickButton,
  expectSearchParams,
  expectUnloadAsked,
} from '../lib/page.js';
import {expect, test} from '../lib/test.js';
import {PHONE_VIEWPORT} from '../lib/viewport.js';

const SIZE_WIDTHS = {sm: 320, default: 384, lg: 576, xl: 768, full: 1216};

const PANEL_CLOSE_PATHS = {
  'the cancel button': (_page, dialog) =>
    dialog.getByRole('button', {name: 'Cancel'}).click(),
  'the close button': (_page, dialog) => getCloseButton(dialog).click(),
  Escape: page => page.keyboard.press('Escape'),
  'an outside click': page => page.mouse.click(8, 8),
};

function getDiscardQuestion(page) {
  return page.getByRole('alertdialog', {
    name: 'You have unsaved changes.',
  });
}

function getDialogBehindQuestion(page, name) {
  return page.getByRole('dialog', {name, includeHidden: true});
}

function openFormShells(page, searchParams) {
  return openFixture(page, 'form-shells', searchParams);
}

function reloadFormShells(page) {
  return reloadFixture(page, 'form-shells');
}

function getRecordAction(page, name) {
  return page
    .getByRole('region', {name: 'Kayıtlar'})
    .getByRole('button', {name, exact: true});
}

async function getFooterLayout(dialog) {
  const [cancel, save] = await Promise.all(
    ['Cancel', 'Save'].map(name =>
      dialog.getByRole('button', {name}).boundingBox(),
    ),
  );
  return {
    isSideBySide: cancel.y === save.y && cancel.x < save.x,
    hasEqualWidths: cancel.width === save.width,
  };
}

async function tabWithin(page, dialog, presses) {
  for (let press = 0; press < presses; press += 1) {
    await page.keyboard.press('Tab');
    await expect
      .poll(() =>
        dialog.evaluate(element => element.contains(document.activeElement)),
      )
      .toBe(true);
  }
}

test.describe('form panel', () => {
  test('?action=create opens the sheet in create mode', async ({page}) => {
    await openFormShells(page, {action: 'create'});

    await expect(getDialog(page, 'Kayıt Ekle')).toBeVisible();
    await expectDialogSlot(page).toBe('sheet-content');
    await expectFixtureState(page).toMatchObject({
      panel: {action: 'create', isOpen: true, targetId: null},
    });
  });

  test('opening create from the page opens the sheet', async ({page}) => {
    await openFormShells(page);

    await getRecordAction(page, 'Ekle').click();

    await expect(getDialog(page, 'Kayıt Ekle')).toBeVisible();
  });

  test('?action=edit&id= opens edit mode on the target record', async ({
    page,
  }) => {
    await openFormShells(page, {action: 'edit', id: 2});
    const dialog = getDialog(page, 'Kayıt Düzenle');

    await expect(dialog).toContainText('Kayıt no: 2');
    await expect(dialog.getByLabel('Ad')).toHaveValue('Barış Kaya');
    await expectFixtureState(page).toMatchObject({
      panel: {action: 'edit', targetId: '2'},
    });
  });

  test('opening edit from a record loads that record', async ({page}) => {
    await openFormShells(page);

    await getRecordAction(page, 'Cem Demir düzenle').click();

    await expect(getDialog(page, 'Kayıt Düzenle').getByLabel('Ad')).toHaveValue(
      'Cem Demir',
    );
    await expectFixtureState(page).toMatchObject({
      panel: {action: 'edit', targetId: '3'},
    });
  });

  test('opening create while edit is open replaces it in the same sheet', async ({
    page,
  }) => {
    await openFormShells(page, {action: 'edit', id: 2});
    const edit = getDialog(page, 'Kayıt Düzenle');
    await expect(edit.getByLabel('Ad')).toHaveValue('Barış Kaya');

    await edit.getByRole('button', {name: 'Yeni kayıt'}).click();

    const create = getDialog(page, 'Kayıt Ekle');
    await expect(create).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(create.getByLabel('Ad')).toHaveValue('');
    await expect(create).not.toContainText('Kayıt no');
    await expectFixtureState(page).toMatchObject({
      panel: {action: 'create', targetId: null},
    });
  });

  test('opening another action replaces the open panel, one at a time', async ({
    page,
  }) => {
    await openFormShells(page, {action: 'edit', id: 2});

    await getDialog(page, 'Kayıt Düzenle')
      .getByRole('button', {name: 'Bunun yerine davet et'})
      .click();

    await expect(getDialog(page, 'Davet Et')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
  });

  test('the sheet traps focus, Escape closes it and focus returns to the opener', async ({
    page,
  }) => {
    await openFormShells(page);
    const opener = getRecordAction(page, 'Ekle');
    await opener.focus();

    await page.keyboard.press('Enter');
    const dialog = getDialog(page, 'Kayıt Ekle');
    await expect(dialog).toBeVisible();

    const name = dialog.getByLabel('Ad');
    await expect(name).toBeFocused();
    const tabStops = await dialog
      .getByRole('textbox')
      .or(dialog.getByRole('button'))
      .count();
    expect(tabStops).toBe(5);

    await tabWithin(page, dialog, tabStops);

    await expect(name).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('a valid submit hands the values over and closes the panel', async ({
    page,
  }) => {
    await openFormShells(page, {action: 'create'});
    const dialog = getDialog(page, 'Kayıt Ekle');

    await dialog.getByLabel('Ad').pressSequentially('Deniz Şahin');
    await getSaveButton(dialog).click();

    await expectFixtureState(page).toMatchObject({
      submitted: {panel: {name: 'Deniz Şahin'}},
    });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('a dirty form in the panel asks before the page unloads', async ({
    page,
  }) => {
    await openFormShells(page, {action: 'create'});
    const name = getDialog(page, 'Kayıt Ekle').getByLabel('Ad');

    await name.pressSequentially('Taslak');
    await expect(name).toHaveValue('Taslak');

    await expectUnloadAsked(page);
    await expect(name).toHaveValue('Taslak');
  });

  test('a dirty form in the panel asks before the panel closes, and confirming discards it', async ({
    page,
  }) => {
    await openFormShells(page, {action: 'create'});
    const dialog = getDialog(page, 'Kayıt Ekle');
    await dialog.getByLabel('Ad').pressSequentially('Taslak');

    await dialog.getByRole('button', {name: 'Cancel'}).click();

    await expect(getDiscardQuestion(page)).toBeVisible();
    await expect(getDialogBehindQuestion(page, 'Kayıt Ekle')).toBeVisible();

    await getDiscardQuestion(page).getByRole('button', {name: 'Close'}).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    await getRecordAction(page, 'Ekle').click();

    await expect(getDialog(page, 'Kayıt Ekle').getByLabel('Ad')).toHaveValue(
      '',
    );
  });

  for (const [path, close] of Object.entries(PANEL_CLOSE_PATHS)) {
    test(`a dirty panel asks before ${path} closes it, and cancelling keeps the panel and the values`, async ({
      page,
    }) => {
      await openFormShells(page, {action: 'create'});
      const dialog = getDialog(page, 'Kayıt Ekle');
      const name = dialog.getByLabel('Ad');
      await name.pressSequentially('Taslak');

      await close(page, dialog);

      await expect(getDiscardQuestion(page)).toBeVisible();
      await expect(page.getByRole('alertdialog')).toHaveCount(1);

      await getDiscardQuestion(page)
        .getByRole('button', {name: 'Cancel'})
        .click();

      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await expect(name).toHaveValue('Taslak');
    });
  }

  test('Escape on the question cancels it and keeps the dirty panel open', async ({
    page,
  }) => {
    await openFormShells(page, {action: 'create'});
    const dialog = getDialog(page, 'Kayıt Ekle');
    await dialog.getByLabel('Ad').pressSequentially('Taslak');
    await page.keyboard.press('Escape');
    await expect(
      getDiscardQuestion(page).getByRole('button', {name: 'Cancel'}),
    ).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(dialog.getByLabel('Ad')).toHaveValue('Taslak');
  });

  test('a clean form in the panel closes at once, without asking', async ({
    page,
  }) => {
    await openFormShells(page, {action: 'edit', id: 2});
    const dialog = getDialog(page, 'Kayıt Düzenle');
    await dialog.getByLabel('Ad').click();

    await dialog.getByRole('button', {name: 'Cancel'}).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  for (const [size, width] of Object.entries(SIZE_WIDTHS)) {
    test(`the ${size} size variant sets the sheet width`, async ({page}) => {
      await openFormShells(page, {action: 'create', panelSize: size});
      const dialog = getDialog(page, 'Kayıt Ekle');

      await expect(dialog).toBeVisible();
      await expect
        .poll(async () => (await dialog.boundingBox()).width)
        .toBe(width);
    });
  }

  test('the default sheet puts Cancel and Save side by side, Cancel first', async ({
    page,
  }) => {
    await openFormShells(page, {action: 'create'});

    await expect
      .poll(() => getFooterLayout(getDialog(page, 'Kayıt Ekle')))
      .toEqual({isSideBySide: true, hasEqualWidths: true});
  });

  test('a wide sheet splits its footer buttons in halves', async ({page}) => {
    await openFormShells(page, {action: 'create', panelSize: 'lg'});

    await expect
      .poll(() => getFooterLayout(getDialog(page, 'Kayıt Ekle')))
      .toEqual({isSideBySide: true, hasEqualWidths: true});
  });

  test.describe('at a phone width', () => {
    test.use({viewport: PHONE_VIEWPORT});

    test('the panel is a bottom drawer, still a named dialog', async ({
      page,
    }) => {
      await openFormShells(page, {action: 'create'});
      const dialog = getDialog(page, 'Kayıt Ekle');

      await expect(dialog).toBeVisible();
      await expectDialogSlot(page).toBe('drawer-popup');
      await expect
        .poll(async () => {
          const box = await dialog.boundingBox();
          return {left: box.x, width: box.width, bottom: box.y + box.height};
        })
        .toEqual({
          left: 0,
          width: PHONE_VIEWPORT.width,
          bottom: PHONE_VIEWPORT.height,
        });
    });

    test('the drawer puts Cancel and Save side by side, Cancel first', async ({
      page,
    }) => {
      await openFormShells(page, {action: 'create'});

      await expect
        .poll(() => getFooterLayout(getDialog(page, 'Kayıt Ekle')))
        .toEqual({isSideBySide: true, hasEqualWidths: true});
    });

    test('a dirty form in the drawer asks before it closes', async ({page}) => {
      await openFormShells(page, {action: 'create'});
      const dialog = getDialog(page, 'Kayıt Ekle');
      await dialog.getByLabel('Ad').pressSequentially('Taslak');

      await dialog.getByRole('button', {name: 'Cancel'}).click();

      await expect(getDiscardQuestion(page)).toBeVisible();

      await getDiscardQuestion(page)
        .getByRole('button', {name: 'Cancel'})
        .click();

      await expect(dialog.getByLabel('Ad')).toHaveValue('Taslak');
    });
  });
});

test.describe('form dialog', () => {
  test('opens as a top-anchored dialog named by its title, under its own action', async ({
    page,
  }) => {
    await openFormShells(page);

    await getRecordAction(page, 'Davet et').click();
    const dialog = getDialog(page, 'Davet Et');

    await expect(dialog).toBeVisible();
    await expectDialogSlot(page).toBe('dialog-content');
    await expect.poll(async () => (await dialog.boundingBox()).y).toBe(32);
  });

  for (const [size, width] of Object.entries(SIZE_WIDTHS)) {
    test(`the ${size} size variant sets its width`, async ({page}) => {
      await openFormShells(page, {action: 'invite', dialogSize: size});
      const dialog = getDialog(page, 'Davet Et');

      await expect(dialog).toBeVisible();
      await expect
        .poll(async () => (await dialog.boundingBox()).width)
        .toBe(width);
    });
  }

  test('Escape closes it and focus returns to the opener', async ({page}) => {
    await openFormShells(page);
    const opener = getRecordAction(page, 'Davet et');
    await opener.focus();

    await page.keyboard.press('Enter');
    await expect(getDialog(page, 'Davet Et')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('a dirty form in the dialog asks before Escape closes it', async ({
    page,
  }) => {
    await openFormShells(page, {action: 'invite'});
    const dialog = getDialog(page, 'Davet Et');
    await dialog.getByLabel('E-posta').pressSequentially('ece@');

    await page.keyboard.press('Escape');

    await expect(getDiscardQuestion(page)).toBeVisible();
    await expect(getDialogBehindQuestion(page, 'Davet Et')).toBeVisible();

    await getDiscardQuestion(page).getByRole('button', {name: 'Close'}).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('an invalid submit focuses the field, a valid one hands the values over and closes', async ({
    page,
  }) => {
    await openFormShells(page, {action: 'invite'});
    const dialog = getDialog(page, 'Davet Et');
    const email = dialog.getByLabel('E-posta');

    await getSaveButton(dialog).click();

    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute('aria-invalid', 'true');

    await email.pressSequentially('ece@ornek.com');
    await getSaveButton(dialog).click();

    await expectFixtureState(page).toMatchObject({
      submitted: {dialog: {email: 'ece@ornek.com'}},
    });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test.describe('at a phone width', () => {
    test.use({viewport: PHONE_VIEWPORT});

    test('the dialog is a drawer, still a named dialog', async ({page}) => {
      await openFormShells(page, {action: 'invite'});

      await expect(getDialog(page, 'Davet Et')).toBeVisible();
      await expectDialogSlot(page).toBe('drawer-popup');
    });
  });
});

test.describe('tab query', () => {
  test('a selected tab is written to the URL and restored by a reload', async ({
    page,
  }) => {
    await openFormShells(page);
    await expect(getTab(page, 'Genel')).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await getTab(page, 'Bildirimler').click();

    await expectSearchParams(page).toEqual({tab: 'bildirim'});
    await expect(getTabPanel(page, 'Bildirimler')).toContainText(
      'Bildirimler sekmesinin içeriği.',
    );
    await expectFixtureState(page).toMatchObject({tab: 'bildirim'});

    await reloadFormShells(page);

    await expect(getTab(page, 'Bildirimler')).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await getTab(page, 'Genel').click();

    await expectSearchParams(page).toEqual({tab: 'genel'});
  });

  test('the tab menu is a vertical tablist whose ArrowDown and ArrowUp move the focus between tabs', async ({
    page,
  }) => {
    await openFormShells(page);
    await expect(page.getByRole('tablist')).toHaveAttribute(
      'aria-orientation',
      'vertical',
    );
    await getTab(page, 'Genel').focus();

    await page.keyboard.press('ArrowDown');
    await expect(getTab(page, 'Bildirimler')).toBeFocused();

    await page.keyboard.press('ArrowUp');
    await expect(getTab(page, 'Genel')).toBeFocused();
  });

  test('a tab change clears the keys the tabs own and keeps every other param', async ({
    page,
  }) => {
    await openFormShells(page, {
      pageNumber: 3,
      search: 'ada',
      sort: '-name',
      status: 'active',
      note: 'kalsın',
    });

    await getTab(page, 'Bildirimler').click();

    await expectSearchParams(page).toEqual({tab: 'bildirim', note: 'kalsın'});
  });

  test('an unknown tab falls back to the first one', async ({page}) => {
    await openFormShells(page, {tab: 'nope'});

    await expect(getTab(page, 'Genel')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expectFixtureState(page).toMatchObject({tab: 'genel'});
  });
});

test('a tab marker shows beside its label and stays out of the tab name', async ({
  page,
}) => {
  await openFormShells(page);

  const markedTab = page.getByRole('tab', {name: 'Güvenlik', exact: true});

  await expect(markedTab).toHaveText('Güvenlik*');
  await expect(page.getByRole('tab', {name: 'Genel', exact: true})).toHaveText(
    'Genel',
  );
});

test('a tab panel names itself with a heading hidden from view', async ({
  page,
}) => {
  await openFormShells(page);
  const heading = getTabPanel(page, 'Genel').getByRole('heading', {
    level: 2,
    name: 'Genel',
  });

  const box = await heading.boundingBox();

  expect(box.height).toBeLessThanOrEqual(1);
});

test.describe('tab menu at a phone width', () => {
  test.use({viewport: PHONE_VIEWPORT});

  test('the bar opens a named bottom drawer listing the tabs, and a choice switches the tab and closes it', async ({
    page,
  }) => {
    await openFormShells(page);

    await clickButton(page, 'Genel');

    const picker = getDialog(page, 'Genel');
    await Promise.all([
      expect(picker).toBeVisible(),
      expectDialogSlot(page).toBe('drawer-popup'),
      expect(picker.getByRole('button', {name: 'Güvenlik'})).toBeVisible(),
    ]);

    await clickButton(picker, 'Bildirimler');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await Promise.all([
      expect(
        page.getByRole('button', {name: 'Bildirimler', exact: true}),
      ).toBeVisible(),
      expect(getTabPanel(page, 'Bildirimler')).toContainText(
        'Bildirimler sekmesinin içeriği.',
      ),
      expectSearchParams(page).toEqual({tab: 'bildirim'}),
    ]);
  });

  test('a long tab list stays on the screen and scrolls to its last tab', async ({
    page,
  }) => {
    await openFormShells(page, {hasManyTabs: true});
    await clickButton(page, 'Genel');
    const picker = getDialog(page, 'Genel');
    await expect
      .poll(async () => {
        const box = await picker.boundingBox();
        return Math.round(box.y + box.height);
      })
      .toBe(PHONE_VIEWPORT.height);
    const pickerBox = await picker.boundingBox();
    const lastTab = picker.getByRole('button', {name: 'Ek sekme 20'});

    expect(pickerBox.y).toBeGreaterThanOrEqual(96);
    await expect(lastTab).not.toBeInViewport();

    await lastTab.scrollIntoViewIfNeeded();
    await expect(lastTab).toBeInViewport();
    await lastTab.click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await Promise.all([
      expect(getTabPanel(page, 'Ek sekme 20')).toContainText(
        'Ek sekme 20 sekmesinin içeriği.',
      ),
      expectSearchParams(page).toMatchObject({tab: 'ek-20'}),
    ]);
  });
});
