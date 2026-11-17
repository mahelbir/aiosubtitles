import {
  expectFixtureState,
  openFixture,
  readFixtureState,
} from '../lib/fixture-page.js';
import {getForm, getFormField} from '../lib/locators.js';
import {expect, test} from '../lib/test.js';

const FIRST_FORM = 'Birinci form';
const POSITIVE_MESSAGE = 'Fiyat sıfırdan büyük olmalı';

async function clear(field) {
  await field.press('ControlOrMeta+A');
  await field.press('Backspace');
}

test.describe('number input', () => {
  test.beforeEach(async ({page}) => {
    await openFixture(page, 'number-input');
  });

  for (const [typed, expected] of [
    ['1,5', 1.5],
    ['1.5', 1.5],
    ['1.234,5', 1234.5],
  ]) {
    test(`typing ${typed} stores the number ${expected}`, async ({page}) => {
      await getFormField(page, FIRST_FORM, 'Tutar').pressSequentially(typed);

      await expectFixtureState(page).toMatchObject({
        first: {amount: {value: expected, type: 'number'}},
      });
    });
  }

  test('refuses letters while typing', async ({page}) => {
    const amount = getFormField(page, FIRST_FORM, 'Tutar');

    await amount.pressSequentially('a-2b,7x5');

    await expect(amount).toHaveValue('-2,75');
    await expectFixtureState(page).toMatchObject({
      first: {amount: {value: -2.75, type: 'number'}},
    });
  });

  test('refuses the minus key under a zero minimum', async ({page}) => {
    const price = getFormField(page, FIRST_FORM, 'Fiyat');

    await price.pressSequentially('-12,5');

    await expect(price).toHaveValue('12,5');
    await expectFixtureState(page).toMatchObject({
      first: {price: {value: 12.5, type: 'number'}},
    });
  });

  test('stores undefined when an optional field is cleared', async ({page}) => {
    const amount = getFormField(page, FIRST_FORM, 'Tutar');

    await amount.pressSequentially('5');
    await expectFixtureState(page).toMatchObject({first: {amount: {value: 5}}});
    await clear(amount);

    await expect(amount).toHaveValue('');
    await expectFixtureState(page).toMatchObject({
      first: {amount: {type: 'undefined'}},
    });
    expect((await readFixtureState(page)).first.amount).not.toHaveProperty(
      'value',
    );
  });

  test('stores null when a nullable field is cleared', async ({page}) => {
    const stock = getFormField(page, FIRST_FORM, 'Stok');

    await stock.pressSequentially('5');
    await expectFixtureState(page).toMatchObject({first: {stock: {value: 5}}});
    await clear(stock);

    await expectFixtureState(page).toMatchObject({
      first: {stock: {value: null, type: 'object'}},
    });
  });

  test('formats a programmatic value in the app locale', async ({page}) => {
    await page.getByRole('button', {name: 'Tutarı dışarıdan ayarla'}).click();

    await expect(getFormField(page, FIRST_FORM, 'Tutar')).toHaveValue('1234,5');
    await expectFixtureState(page).toMatchObject({
      first: {amount: {value: 1234.5, type: 'number'}},
    });
  });

  test('commits and reformats on blur, and Tab moves on', async ({page}) => {
    const amount = getFormField(page, FIRST_FORM, 'Tutar');

    await amount.pressSequentially('12,50');
    await expect(amount).toHaveValue('12,50');
    await amount.press('Tab');

    await expect(amount).toHaveValue('12,5');
    await expect(getFormField(page, FIRST_FORM, 'Fiyat')).toBeFocused();
    expect(await page.evaluate(() => window.__fixture.focused())).toBe(
      'input "Fiyat"',
    );
    await expectFixtureState(page).toMatchObject({
      first: {amount: {value: 12.5}},
    });
  });

  test('is labelled, numeric on mobile and keyed on its form', async ({
    page,
  }) => {
    const first = getFormField(page, FIRST_FORM, 'Tutar');
    const second = getFormField(page, 'İkinci form', 'Tutar');

    await expect(first).toHaveAttribute('inputmode', /^(decimal|numeric)$/);
    await expect(second).toHaveAttribute('inputmode', /^(decimal|numeric)$/);
    const [firstId, secondId] = await Promise.all([
      first.getAttribute('id'),
      second.getAttribute('id'),
    ]);
    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();
    expect(firstId).not.toBe(secondId);
  });

  test('shows a schema error only once the edited field is left', async ({
    page,
  }) => {
    const price = getFormField(page, FIRST_FORM, 'Fiyat');
    const message = getForm(page, FIRST_FORM).getByText(POSITIVE_MESSAGE);

    await price.pressSequentially('0');
    await expectFixtureState(page).toMatchObject({
      first: {price: {value: 0, error: POSITIVE_MESSAGE}},
    });
    await expect(message).toHaveCount(0);
    await expect(price).toHaveAttribute('aria-invalid', 'false');

    await price.press('Tab');

    await expect(message).toBeVisible();
    await expect(price).toHaveAttribute('aria-invalid', 'true');
    await expect(price).toHaveAccessibleDescription(POSITIVE_MESSAGE);
  });

  test('keeps the amount while the addon toggles', async ({page}) => {
    const discount = getFormField(page, FIRST_FORM, 'İndirim');
    const fixed = page.getByRole('button', {name: 'Sabit tutar'});

    await discount.pressSequentially('15');
    await expectFixtureState(page).toMatchObject({
      first: {discountType: {value: 'percent'}},
    });
    await fixed.click();

    await expect(fixed).toHaveAttribute('aria-pressed', 'true');
    await expect(discount).toHaveValue('15');
    await expectFixtureState(page).toMatchObject({
      first: {
        discount: {value: 15, type: 'number'},
        discountType: {value: 'fixed'},
      },
    });
  });

  test('submits numbers, not strings', async ({page}) => {
    await getFormField(page, FIRST_FORM, 'Tutar').pressSequentially('1,5');
    await getFormField(page, FIRST_FORM, 'Fiyat').pressSequentially('2');
    await getFormField(page, FIRST_FORM, 'Kayıt no').pressSequentially('7');
    await getFormField(page, FIRST_FORM, 'İndirim').pressSequentially('10');

    await page.getByRole('button', {name: 'Gönder'}).click();

    await expectFixtureState(page).toMatchObject({
      submitted: {
        amount: 1.5,
        price: 2,
        id: 7,
        discount: 10,
        discountType: 'percent',
        stock: null,
      },
    });
  });

  test('digests the fixture for specs and MCP alike', async ({page}) => {
    const digest = await page.evaluate(() =>
      window.__fixture.digest('[data-testid="fixture"]'),
    );

    expect(digest.size.w).toBeGreaterThan(0);
    const amount = digest.elements.find(
      element => element.tag === 'input' && element.label === 'Tutar',
    );
    expect(amount.box.w).toBeGreaterThan(0);
    expect(amount.box.h).toBeGreaterThan(0);
  });
});
