import {openFixture} from '../lib/fixture-page.js';
import {expect, test} from '../lib/test.js';

function getCardPart(page, section, part) {
  return page
    .getByRole('region', {name: section})
    .getByRole('group', {name: part});
}

test.describe('portal slot', () => {
  test('renders the content in the slot, under the context it was declared in', async ({
    page,
  }) => {
    await openFixture(page, 'portal-slot');

    await expect(
      getCardPart(page, 'Yuva ile', 'Kart başlığı').getByRole('button', {
        name: 'Gövde: 0',
      }),
    ).toBeVisible();
    await expect(
      getCardPart(page, 'Yuva ile', 'Kart gövdesi').getByRole('button'),
    ).toHaveCount(0);
  });

  test('keeps the state of the component that declared the content', async ({
    page,
  }) => {
    await openFixture(page, 'portal-slot');
    const header = getCardPart(page, 'Yuva ile', 'Kart başlığı');

    await header.getByRole('button', {name: 'Gövde: 0'}).click();

    await expect(header.getByRole('button', {name: 'Gövde: 1'})).toBeVisible();
  });

  test('keeps the content in the slot that is still mounted when another one leaves', async ({
    page,
  }) => {
    await openFixture(page, 'portal-slot');
    const section = page.getByRole('region', {name: 'Yuva devri'});

    await section.getByRole('button', {name: 'İlk yuvayı kaldır'}).click();

    await expect(section.getByRole('group', {name: 'İlk yuva'})).toHaveCount(0);
    await expect(
      section
        .getByRole('group', {name: 'Son yuva'})
        .getByRole('button', {name: 'Devir: 0'}),
    ).toBeVisible();
  });

  test('renders the content in place when no slot is provided', async ({
    page,
  }) => {
    await openFixture(page, 'portal-slot');

    await expect(
      getCardPart(page, 'Yuva olmadan', 'Kart gövdesi').getByRole('button', {
        name: 'Gövde: 0',
      }),
    ).toBeVisible();
    await expect(
      getCardPart(page, 'Yuva olmadan', 'Kart başlığı').getByRole('button'),
    ).toHaveCount(0);
  });
});
