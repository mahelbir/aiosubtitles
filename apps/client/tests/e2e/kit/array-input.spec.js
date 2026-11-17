import {expectFixtureState, openFixture} from '../lib/fixture-page.js';
import {getForm, getFormField} from '../lib/locators.js';
import {
  clickButton,
  expectAnimated,
  recordAnimations,
  retype,
  waitForAnimations,
} from '../lib/page.js';
import {expect, test} from '../lib/test.js';

const MIN_MESSAGE = 'En az bir kişi ekleyin';
const LINK_FORM = 'Bağlantı formu';
const COM_LINK = 'https://ornek.com';
const ORG_LINK = 'https://ornek.org';
const NET_LINK = 'https://ornek.net';
const LINK_ACTIONS = ['Yukarı taşı', 'Aşağı taşı', 'Kaldır'];
const HIDE_LINKS = 'Bağlantıları gizle';
const LOCK_LINKS = 'Bağlantıları kilitle';
const MARK_ATTRIBUTE = 'data-marked';

function getItem(page, position) {
  return page.getByRole('group', {name: `Kişi ${position}`, exact: true});
}

function markItem(page, position) {
  return getItem(page, position).evaluate(
    (node, attribute) => node.setAttribute(attribute, ''),
    MARK_ATTRIBUTE,
  );
}

function getName(page, position) {
  return getItem(page, position).getByLabel('Ad');
}

function getAction(page, position, name) {
  return getItem(page, position).getByRole('button', {name});
}

function getAddButton(page) {
  return page.getByRole('button', {name: 'Kişi ekle'});
}

function getMinMessage(page) {
  return getForm(page, 'Kişi formu').getByText(MIN_MESSAGE);
}

function getSubmitButton(page) {
  return page.getByRole('button', {name: 'Gönder'});
}

function getLink(page, position) {
  return getFormField(page, LINK_FORM, `Bağlantı ${position}`);
}

function getLinkAction(page, position, name) {
  return getForm(page, LINK_FORM)
    .getByRole('button', {name, exact: true})
    .nth(position - 1);
}

function getAddLinkButton(page) {
  return page.getByRole('button', {name: 'Bağlantı ekle'});
}

function getSaveLinksButton(page) {
  return page.getByRole('button', {name: 'Bağlantıları kaydet'});
}

function expectLinkActionsDisabled(page) {
  return [
    ...LINK_ACTIONS.flatMap(name =>
      [1, 2].map(position =>
        expect(getLinkAction(page, position, name)).toBeDisabled(),
      ),
    ),
    expect(getAddLinkButton(page)).toBeDisabled(),
  ];
}

function expectFieldValue(page, name, value) {
  return expectFixtureState(page).toMatchObject({fields: {[name]: {value}}});
}

function expectNames(page, names) {
  return expectFieldValue(
    page,
    'people',
    names.map(name => ({name})),
  );
}

test.describe('array input', () => {
  test('add appends an empty item', async ({page}) => {
    await openFixture(page, 'array-input');

    await getAddButton(page).click();

    await expect(getName(page, 4)).toHaveValue('');
    await expectNames(page, ['Ali', 'Ayşe', 'Can', '']);
  });

  test('add is disabled at the cap and enabled again after a removal', async ({
    page,
  }) => {
    await openFixture(page, 'array-input');
    const add = getAddButton(page);

    await add.click();
    await expect(add).toBeDisabled();

    await getAction(page, 1, 'Kaldır').click();

    await expect(add).toBeEnabled();
    await expectNames(page, ['Ayşe', 'Can', '']);
  });

  test('moving an item down reorders the list and focus follows the item', async ({
    page,
  }) => {
    await openFixture(page, 'array-input');
    await getAction(page, 1, 'Aşağı taşı').focus();

    await page.keyboard.press('Enter');

    await expect(getName(page, 2)).toHaveValue('Ali');
    await expect(getAction(page, 2, 'Aşağı taşı')).toBeFocused();
    await expectNames(page, ['Ayşe', 'Ali', 'Can']);
  });

  test('at the last position the down action is disabled and focus lands on the up action', async ({
    page,
  }) => {
    await openFixture(page, 'array-input');
    await getAction(page, 2, 'Aşağı taşı').focus();

    await page.keyboard.press('Enter');

    await expect(getName(page, 3)).toHaveValue('Ayşe');
    await expect(getAction(page, 3, 'Aşağı taşı')).toBeDisabled();
    await expect(getAction(page, 3, 'Yukarı taşı')).toBeFocused();
    await expectNames(page, ['Ali', 'Can', 'Ayşe']);
  });

  test('moving an item up follows it to the top, where focus lands on the down action', async ({
    page,
  }) => {
    await openFixture(page, 'array-input');
    await getAction(page, 3, 'Yukarı taşı').focus();

    await page.keyboard.press('Enter');

    await expect(getName(page, 2)).toHaveValue('Can');
    await expect(getAction(page, 2, 'Yukarı taşı')).toBeFocused();

    await page.keyboard.press('Enter');

    await expect(getName(page, 1)).toHaveValue('Can');
    await expect(getAction(page, 1, 'Yukarı taşı')).toBeDisabled();
    await expect(getAction(page, 1, 'Aşağı taşı')).toBeFocused();
    await expectNames(page, ['Can', 'Ali', 'Ayşe']);
  });

  test('a moved item keeps its own element, so state living in it moves along', async ({
    page,
  }) => {
    await openFixture(page, 'array-input');
    await markItem(page, 1);

    await getAction(page, 1, 'Aşağı taşı').click();

    await expect(getName(page, 2)).toHaveValue('Ali');
    await expect(getItem(page, 2)).toHaveAttribute(MARK_ATTRIBUTE);
    await expect(getItem(page, 1)).not.toHaveAttribute(MARK_ATTRIBUTE);
  });

  test('an item’s error follows it through a move', async ({page}) => {
    await openFixture(page, 'array-input');
    await getName(page, 2).press('ControlOrMeta+A');
    await getName(page, 2).press('Backspace');
    await page.keyboard.press('Tab');
    await expect(getName(page, 2)).toHaveAttribute('aria-invalid', 'true');

    await getAction(page, 1, 'Aşağı taşı').click();

    await expect(getName(page, 1)).toHaveValue('');
    await expect(getName(page, 1)).toHaveAttribute('aria-invalid', 'true');
    await expect(getName(page, 1)).toHaveAccessibleDescription('Ad gerekli');
    await expect(getName(page, 2)).toHaveAttribute('aria-invalid', 'false');
  });

  test('removing an item leaves the elements of the items after it in place', async ({
    page,
  }) => {
    await openFixture(page, 'array-input');
    await markItem(page, 2);

    await getAction(page, 1, 'Kaldır').click();
    await waitForAnimations(page);

    await expect(getName(page, 1)).toHaveValue('Ayşe');
    await expect(getItem(page, 1)).toHaveAttribute(MARK_ATTRIBUTE);
    await expect(getItem(page, 2)).not.toHaveAttribute(MARK_ATTRIBUTE);
  });

  test('an item’s error follows it through a removal', async ({page}) => {
    await openFixture(page, 'array-input');
    await getName(page, 3).press('ControlOrMeta+A');
    await getName(page, 3).press('Backspace');
    await page.keyboard.press('Tab');
    await expect(getName(page, 3)).toHaveAttribute('aria-invalid', 'true');

    await getAction(page, 1, 'Kaldır').click();
    await waitForAnimations(page);

    await expect(getName(page, 2)).toHaveValue('');
    await expect(getName(page, 2)).toHaveAttribute('aria-invalid', 'true');
    await expect(getName(page, 1)).toHaveAttribute('aria-invalid', 'false');
  });

  test('a click removing the focused item leaves the item taking its place untouched', async ({
    page,
  }) => {
    await openFixture(page, 'array-input', {errorDisplay: 'onTouched'});
    await getAddButton(page).click();
    await getName(page, 3).click();

    await getAction(page, 3, 'Kaldır').click();
    await waitForAnimations(page);

    await expect(getName(page, 3)).toHaveValue('');
    await expect(getName(page, 3)).toHaveAttribute('aria-invalid', 'false');
    await getName(page, 3).focus();
    await page.keyboard.press('Tab');
    await expect(getName(page, 3)).toHaveAttribute('aria-invalid', 'true');
  });

  test('an added item animates in', async ({page}) => {
    await openFixture(page, 'array-input');
    await recordAnimations(page);

    await getAddButton(page).click();

    await expectAnimated(page, 'Kişi 4').toBe(true);
  });

  test('remove focuses the next item’s remove action', async ({page}) => {
    await openFixture(page, 'array-input');
    await getAction(page, 2, 'Kaldır').focus();

    await page.keyboard.press('Enter');
    await waitForAnimations(page);

    await expect(getName(page, 2)).toHaveValue('Can');
    await expect(getAction(page, 2, 'Kaldır')).toBeFocused();
    await expectNames(page, ['Ali', 'Can']);
  });

  test('removing the last item focuses the previous item’s remove action', async ({
    page,
  }) => {
    await openFixture(page, 'array-input');
    await getAction(page, 3, 'Kaldır').focus();

    await page.keyboard.press('Enter');

    await expect(getItem(page, 3)).toHaveCount(0);
    await expect(getAction(page, 2, 'Kaldır')).toBeFocused();
    await expectNames(page, ['Ali', 'Ayşe']);
  });

  test('removing the only item focuses the add button', async ({page}) => {
    await openFixture(page, 'array-input', {count: 1});
    await getAction(page, 1, 'Kaldır').focus();

    await page.keyboard.press('Enter');

    await expect(getItem(page, 1)).toHaveCount(0);
    await expect(getAddButton(page)).toBeFocused();
    await expectNames(page, []);
  });

  test('the array-level minimum waits at the add button until the emptied list is left', async ({
    page,
  }) => {
    await openFixture(page, 'array-input', {count: 1});
    const add = getAddButton(page);
    const message = getMinMessage(page);
    await getAction(page, 1, 'Kaldır').focus();

    await page.keyboard.press('Enter');

    await expect(add).toBeFocused();
    await expectFixtureState(page).toMatchObject({
      fields: {people: {value: [], error: MIN_MESSAGE}},
    });
    await expect(add).toHaveAttribute('aria-invalid', 'false');
    await expect(add).not.toHaveAttribute('aria-describedby');
    await expect(message).toHaveCount(0);

    await page.keyboard.press('Tab');

    await expect(add).toHaveAttribute('aria-invalid', 'true');
    await expect(add).toHaveAccessibleDescription(MIN_MESSAGE);
    await expect(message).toBeVisible();
  });

  test('a submit runs the array-level minimum and reports it at the add button, which takes focus', async ({
    page,
  }) => {
    await openFixture(page, 'array-input', {count: 0});
    const add = getAddButton(page);
    await expectFixtureState(page).toMatchObject({
      fields: {people: {value: [], error: null}},
    });

    await getSubmitButton(page).click();

    await expect(add).toHaveAttribute('aria-invalid', 'true');
    await expect(add).toHaveAccessibleDescription(MIN_MESSAGE);
    await expect(getMinMessage(page)).toBeVisible();
    await expect(add).toBeFocused();
    await expectFixtureState(page).toMatchObject({
      fields: {people: {value: [], error: MIN_MESSAGE}},
      submitted: null,
    });
  });

  test('submit focuses the first invalid nested control', async ({page}) => {
    await openFixture(page, 'array-input');
    for (const position of [2, 3]) {
      await getName(page, position).press('ControlOrMeta+A');
      await getName(page, position).press('Backspace');
    }

    await getName(page, 3).press('Enter');

    await expect(getName(page, 2)).toHaveAttribute('aria-invalid', 'true');
    await expect(getName(page, 3)).toHaveAttribute('aria-invalid', 'true');
    await expect(getName(page, 2)).toBeFocused();
    await expectFixtureState(page).toMatchObject({submitted: null});
  });

  test('submits the values in their new order', async ({page}) => {
    await openFixture(page, 'array-input');
    await getAction(page, 1, 'Aşağı taşı').focus();
    await page.keyboard.press('Enter');

    await getSubmitButton(page).click();

    await expectFixtureState(page).toMatchObject({
      submitted: {people: [{name: 'Ayşe'}, {name: 'Ali'}, {name: 'Can'}]},
    });
  });
});

test.describe('text list input', () => {
  test('items are url boxes named by position holding a plain string list', async ({
    page,
  }) => {
    await openFixture(page, 'array-input');

    await Promise.all([
      expect(getForm(page, LINK_FORM).getByRole('textbox')).toHaveCount(2),
      expect(getLink(page, 1)).toHaveValue(COM_LINK),
      expect(getLink(page, 2)).toHaveValue(ORG_LINK),
      ...[1, 2].flatMap(position => [
        expect(getLink(page, position)).toHaveAttribute('type', 'url'),
        expect(getLink(page, position)).toHaveAttribute(
          'placeholder',
          'https://…',
        ),
      ]),
      expectFieldValue(page, 'links', [COM_LINK, ORG_LINK]),
    ]);
  });

  test('add appends an empty box and is disabled at the cap', async ({
    page,
  }) => {
    await openFixture(page, 'array-input');
    const add = getAddLinkButton(page);

    await add.click();

    await Promise.all([
      expect(getLink(page, 3)).toHaveValue(''),
      expect(add).toBeDisabled(),
      expectFieldValue(page, 'links', [COM_LINK, ORG_LINK, '']),
    ]);
  });

  test('moving a box down renumbers the names and focus follows it', async ({
    page,
  }) => {
    await openFixture(page, 'array-input');
    await getLinkAction(page, 1, 'Aşağı taşı').focus();

    await page.keyboard.press('Enter');

    await Promise.all([
      expect(getLink(page, 1)).toHaveValue(ORG_LINK),
      expect(getLink(page, 2)).toHaveValue(COM_LINK),
      expect(getLinkAction(page, 2, 'Yukarı taşı')).toBeFocused(),
      expectFieldValue(page, 'links', [ORG_LINK, COM_LINK]),
    ]);
  });

  test('an invalid item marks only its own box, and a submit focuses it until it is fixed', async ({
    page,
  }) => {
    await openFixture(page, 'array-input');
    const second = getLink(page, 2);
    await retype(second, 'ftp://x');

    await page.keyboard.press('Tab');

    await Promise.all([
      expect(second).toHaveAttribute('aria-invalid', 'true'),
      expect(second).toHaveAccessibleDescription('URL geçersiz'),
    ]);
    await Promise.all([
      expect(getLink(page, 1)).toHaveAttribute('aria-invalid', 'false'),
      expect(getAddLinkButton(page)).toHaveAttribute('aria-invalid', 'false'),
    ]);

    await getSaveLinksButton(page).click();

    await expect(second).toBeFocused();
    await expectFixtureState(page).toMatchObject({submitted: null});

    await retype(second, NET_LINK);
    await getSaveLinksButton(page).click();

    await expectFixtureState(page).toMatchObject({
      submitted: {links: [COM_LINK, NET_LINK]},
    });
  });

  test('the help text describes the add button', async ({page}) => {
    await openFixture(page, 'array-input');

    await expect(getAddLinkButton(page)).toHaveAccessibleDescription(
      'En fazla üç bağlantı.',
    );
  });

  test('without its own labels a box takes the list label and the add button reads Ekle', async ({
    page,
  }) => {
    await openFixture(page, 'array-input');
    const tagForm = getForm(page, 'Etiket formu');

    await Promise.all([
      expect(
        tagForm.getByRole('textbox', {name: 'Etiket 1', exact: true}),
      ).toHaveValue('yeni'),
      expect(
        tagForm.getByRole('button', {name: 'Ekle', exact: true}),
      ).toBeVisible(),
    ]);
  });

  test('removing the last item focuses the previous remove action of its own list, not the other list’s', async ({
    page,
  }) => {
    await openFixture(page, 'array-input');
    await getLinkAction(page, 2, 'Kaldır').focus();

    await page.keyboard.press('Enter');

    await Promise.all([
      expect(getLink(page, 1)).toHaveValue(COM_LINK),
      expect(getLink(page, 2)).toHaveCount(0),
      expect(getLinkAction(page, 1, 'Kaldır')).toBeFocused(),
      expectFieldValue(page, 'links', [COM_LINK]),
    ]);
  });
});

test.describe('a disabled text list', () => {
  test('locks every box and list action while the other list stays editable', async ({
    page,
  }) => {
    await openFixture(page, 'array-input', {isDisabled: true});

    await Promise.all([
      ...[1, 2].map(position => expect(getLink(page, position)).toBeDisabled()),
      ...expectLinkActionsDisabled(page),
      expect(getName(page, 1)).toBeEnabled(),
      expect(getAction(page, 1, 'Kaldır')).toBeEnabled(),
      expect(getAddButton(page)).toBeEnabled(),
    ]);
  });

  test('Tab from the control before it jumps straight to the submit button', async ({
    page,
  }) => {
    await openFixture(page, 'array-input', {isDisabled: true});
    await getSubmitButton(page).focus();

    await page.keyboard.press('Tab');

    await expect(getSaveLinksButton(page)).toBeFocused();
  });

  test('a submit skips its invalid item and leaves its values out of the payload', async ({
    page,
  }) => {
    await openFixture(page, 'array-input', {
      isDisabled: true,
      hasInvalidLink: true,
    });

    await getSaveLinksButton(page).click();

    await expectFixtureState(page, 'submitted').toEqual({});
    await expect(getLink(page, 1)).toHaveAttribute('aria-invalid', 'false');
  });

  test('stays out of validation and the payload once it unmounts', async ({
    page,
  }) => {
    await openFixture(page, 'array-input', {
      isDisabled: true,
      hasInvalidLink: true,
    });

    await clickButton(page, HIDE_LINKS);
    await expect(getLink(page, 1)).toHaveCount(0);
    await getSaveLinksButton(page).click();

    await expectFixtureState(page, 'submitted').toEqual({});
  });

  test('enabled while unmounted, it stays out until it renders enabled again', async ({
    page,
  }) => {
    await openFixture(page, 'array-input', {
      isDisabled: true,
      hasInvalidLink: true,
    });
    await clickButton(page, HIDE_LINKS);
    await clickButton(page, LOCK_LINKS);

    await getSaveLinksButton(page).click();

    await expectFixtureState(page, 'submitted').toEqual({});

    await clickButton(page, HIDE_LINKS);
    await getSaveLinksButton(page).click();

    await Promise.all([
      expect(getLink(page, 1)).toHaveAttribute('aria-invalid', 'true'),
      expect(getLink(page, 1)).toBeFocused(),
    ]);
  });
});

test.describe('a read-only text list', () => {
  test('keeps every box focusable but read-only and every list action unavailable', async ({
    page,
  }) => {
    await openFixture(page, 'array-input', {isReadOnly: true});

    await Promise.all([
      ...[1, 2].flatMap(position => [
        expect(getLink(page, position)).toBeEnabled(),
        expect(getLink(page, position)).not.toBeEditable(),
      ]),
      ...expectLinkActionsDisabled(page),
    ]);
  });

  test('a submit sends its values', async ({page}) => {
    await openFixture(page, 'array-input', {isReadOnly: true});

    await getSaveLinksButton(page).click();

    await expectFixtureState(page, 'submitted').toEqual({
      links: [COM_LINK, ORG_LINK],
    });
  });

  test('an invalid item blocks the submit, shows its error and takes focus', async ({
    page,
  }) => {
    await openFixture(page, 'array-input', {
      isReadOnly: true,
      hasInvalidLink: true,
    });
    const first = getLink(page, 1);

    await getSaveLinksButton(page).click();

    await Promise.all([
      expect(first).toHaveAttribute('aria-invalid', 'true'),
      expect(first).toHaveAccessibleDescription('URL geçersiz'),
      expect(first).toBeFocused(),
    ]);
    await expectFixtureState(page).toMatchObject({submitted: null});
  });
});
