import {expectFixtureState, openFixture} from '../lib/fixture-page.js';
import {getSaveButton} from '../lib/locators.js';
import {expect, test} from '../lib/test.js';

const FIXTURE_SUBMIT_LABEL = 'Kaydet';

const PASSIVE_MESSAGE = 'Pasif kayıt kaydedilemez.';

function getOption(page, group, name) {
  return page
    .getByRole('group', {name: group})
    .getByRole('button', {name, exact: true});
}

function expectStatusLocked(page) {
  return ['Aktif', 'Pasif'].map(name =>
    expect(getOption(page, 'Durum', name)).toBeDisabled(),
  );
}

test.describe('toggle group input', () => {
  test.beforeEach(async ({page}) => {
    await openFixture(page, 'toggle-group-input');
  });

  test('exposes the pressed option through aria-pressed', async ({page}) => {
    await expect(getOption(page, 'Durum', 'Aktif')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(getOption(page, 'Durum', 'Pasif')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('a click stores the parsed boolean, not its string', async ({page}) => {
    const passive = getOption(page, 'Durum', 'Pasif');

    await passive.click();

    await expect(passive).toHaveAttribute('aria-pressed', 'true');
    await expect(getOption(page, 'Durum', 'Aktif')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expectFixtureState(page, 'fields').toMatchObject({
      isActive: {value: false, type: 'boolean'},
    });
  });

  test('clicking the pressed option keeps it selected', async ({page}) => {
    const active = getOption(page, 'Durum', 'Aktif');

    await active.click();

    await expect(active).toHaveAttribute('aria-pressed', 'true');
    await expectFixtureState(page, 'fields').toMatchObject({
      isActive: {value: true, type: 'boolean'},
    });
  });

  test('the group is a single Tab stop', async ({page}) => {
    const active = getOption(page, 'Durum', 'Aktif');
    await active.focus();

    await page.keyboard.press('Tab');

    await expect(getOption(page, 'Konum', 'Üstüne')).toBeFocused();

    await page.keyboard.press('Shift+Tab');

    await expect(active).toBeFocused();
  });

  test('arrow keys move focus around the group and wrap, without selecting', async ({
    page,
  }) => {
    const active = getOption(page, 'Durum', 'Aktif');
    const passive = getOption(page, 'Durum', 'Pasif');
    await active.focus();

    await page.keyboard.press('ArrowRight');
    await expect(passive).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(active).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(passive).toBeFocused();

    await expect(active).toHaveAttribute('aria-pressed', 'true');
    await expectFixtureState(page, 'fields').toMatchObject({
      isActive: {value: true},
    });
  });

  test('Space and Enter select the focused option', async ({page}) => {
    const active = getOption(page, 'Durum', 'Aktif');
    const passive = getOption(page, 'Durum', 'Pasif');
    await active.focus();

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');

    await expect(passive).toHaveAttribute('aria-pressed', 'true');
    await expectFixtureState(page, 'fields').toMatchObject({
      isActive: {value: false},
    });

    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');

    await expect(active).toHaveAttribute('aria-pressed', 'true');
    await expectFixtureState(page, 'fields').toMatchObject({
      isActive: {value: true},
    });
  });

  test('arrow navigation skips a disabled option', async ({page}) => {
    const above = getOption(page, 'Konum', 'Üstüne');
    await above.focus();

    await page.keyboard.press('ArrowRight');
    await expect(getOption(page, 'Konum', 'Altına')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(above).toBeFocused();
  });

  test('renders an enum-plus toList option list by its labels and stores its values', async ({
    page,
  }) => {
    const placement = page.getByRole('group', {name: 'Konum'});

    await expect(placement).toMatchAriaSnapshot(`
      - group "Konum":
        - group:
          - button "Üstüne" [pressed=true]
          - button "Aynı seviyeye" [disabled]
          - button "Altına" [pressed=false]
    `);

    await getOption(page, 'Konum', 'Altına').click();

    await expectFixtureState(page, 'fields').toMatchObject({
      placement: {value: 'below', type: 'string'},
    });
  });

  test('an option with help opens its popover on hover and closes it when the pointer leaves', async ({
    page,
  }) => {
    const above = getOption(page, 'Konum', 'Üstüne');
    const popover = page
      .getByRole('dialog')
      .filter({hasText: 'Seçili rolün üstüne yerleşir.'});

    await above.hover();

    await expect(popover).toBeVisible();
    await expect(above).toHaveAttribute('aria-expanded', 'true');

    await page.mouse.move(0, 0);

    await expect(popover).toBeHidden();
    await expect(above).toHaveAttribute('aria-expanded', 'false');
  });

  test('a plain option carries no help popover', async ({page}) => {
    await expect(getOption(page, 'Konum', 'Üstüne')).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
    await expect(getOption(page, 'Konum', 'Altına')).not.toHaveAttribute(
      'aria-haspopup',
    );
  });

  test('helped and plain options share one cursor', async ({page}) => {
    const plainCursor = await getOption(page, 'Konum', 'Altına').evaluate(
      element => getComputedStyle(element).cursor,
    );

    await expect(getOption(page, 'Konum', 'Üstüne')).toHaveCSS(
      'cursor',
      plainCursor,
    );
    await expect(getOption(page, 'Durum', 'Aktif')).toHaveCSS(
      'cursor',
      plainCursor,
    );
  });
});

test.describe('a toggle group with a field validator', () => {
  test('a submit runs it, shows its error and sends nothing', async ({
    page,
  }) => {
    await openFixture(page, 'toggle-group-input', {isPassive: true});

    await getSaveButton(page, FIXTURE_SUBMIT_LABEL).click();

    await expect(page.getByText(PASSIVE_MESSAGE, {exact: true})).toBeVisible();
    await expectFixtureState(page, 'fields').toMatchObject({
      isActive: {value: false, error: PASSIVE_MESSAGE},
    });
    await expectFixtureState(page, 'submitted').toBeNull();
  });
});

test.describe('a disabled toggle group', () => {
  test('locks every option while the other group stays editable', async ({
    page,
  }) => {
    await openFixture(page, 'toggle-group-input', {isDisabled: true});

    await Promise.all([
      ...expectStatusLocked(page),
      expect(getOption(page, 'Konum', 'Altına')).toBeEnabled(),
    ]);
  });

  test('a submit skips its field validator and leaves its value out of the payload', async ({
    page,
  }) => {
    await openFixture(page, 'toggle-group-input', {
      isDisabled: true,
      isPassive: true,
    });

    await getSaveButton(page, FIXTURE_SUBMIT_LABEL).click();

    await expectFixtureState(page, 'submitted').toEqual({placement: 'above'});
    await expect(page.getByText(PASSIVE_MESSAGE, {exact: true})).toHaveCount(0);
  });
});

test.describe('a read-only toggle group', () => {
  test('keeps its pressed option and makes every option unavailable', async ({
    page,
  }) => {
    await openFixture(page, 'toggle-group-input', {isReadOnly: true});

    await Promise.all([
      ...expectStatusLocked(page),
      expect(getOption(page, 'Durum', 'Aktif')).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    ]);
  });

  test('a submit sends its value', async ({page}) => {
    await openFixture(page, 'toggle-group-input', {isReadOnly: true});

    await getSaveButton(page, FIXTURE_SUBMIT_LABEL).click();

    await expectFixtureState(page, 'submitted').toEqual({
      isActive: true,
      placement: 'above',
    });
  });

  test('its field validator still blocks the submit and shows its error', async ({
    page,
  }) => {
    await openFixture(page, 'toggle-group-input', {
      isReadOnly: true,
      isPassive: true,
    });

    await getSaveButton(page, FIXTURE_SUBMIT_LABEL).click();

    await expect(page.getByText(PASSIVE_MESSAGE, {exact: true})).toBeVisible();
    await expectFixtureState(page, 'submitted').toBeNull();
  });
});
