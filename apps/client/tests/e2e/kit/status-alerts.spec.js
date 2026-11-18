import {omit} from 'es-toolkit';
import {
  expectFixtureState,
  openFixture,
  readDigest,
} from '../lib/fixture-page.js';
import {readTokenColor} from '../lib/page.js';
import {expect, test} from '../lib/test.js';

const PRESETS = [
  {name: 'error', section: 'Hata', token: '--destructive'},
  {name: 'warning', section: 'Uyarı', token: '--warning'},
];

function getAlerts(page, section) {
  return page.getByRole('region', {name: section}).getByRole('alert');
}

function readPlacement(alert) {
  return alert.evaluate(element => {
    const title = element
      .querySelector('[data-slot="alert-title"]')
      .getBoundingClientRect();
    const description = element.querySelector(
      '[data-slot="alert-description"]',
    );
    const range = document.createRange();
    range.selectNodeContents(description.firstChild);
    const text = range.getBoundingClientRect();
    const action = description.querySelector('button').getBoundingClientRect();
    return {
      isTextUnderTitle: text.left === title.left && text.top >= title.bottom,
      isOnTextRow: action.top < text.bottom && text.top < action.bottom,
      isAfterText: action.left >= text.right,
    };
  });
}

async function readLayout(page, name) {
  const digest = await readDigest(page, `[data-testid="${name}-alerts"]`);
  return digest.elements.map(element => ({
    ...element,
    style: omit(element.style, ['color']),
  }));
}

test.describe('status alerts', () => {
  for (const {name, section, token} of PRESETS) {
    test.describe(`the ${name} preset`, () => {
      test('announces its title and text as an alert, led by its icon', async ({
        page,
      }) => {
        await openFixture(page, 'status-alerts');
        const alerts = getAlerts(page, section);

        await expect(alerts).toHaveCount(2);
        await expect(alerts.first()).toContainText('Başlık');
        await expect(alerts.first()).toContainText('Açıklama metni.');
        await expect(alerts.last()).toHaveText('Yalnızca metin.');
        for (const alert of await alerts.all()) {
          await expect(alert.locator('svg')).toBeVisible();
        }
      });

      test('keeps the text under its title and the action beside the text, where it answers a click', async ({
        page,
      }) => {
        await openFixture(page, 'status-alerts');
        const alert = getAlerts(page, section).first();

        expect(await readPlacement(alert)).toEqual({
          isTextUnderTitle: true,
          isOnTextRow: true,
          isAfterText: true,
        });

        await alert.getByRole('button', {name: 'Tekrar dene'}).click();

        await expectFixtureState(page, 'presses').toEqual({[name]: 1});
      });

      test(`paints the ${token} token`, async ({page}) => {
        await openFixture(page, 'status-alerts');
        const [tokenColor, bodyColor] = await Promise.all([
          readTokenColor(page, token),
          readTokenColor(page, '--foreground'),
        ]);

        expect(tokenColor).not.toBe(bodyColor);
        await expect(getAlerts(page, section).first()).toHaveCSS(
          'color',
          tokenColor,
        );
      });
    });
  }

  test('the presets share one layout and differ only in colour', async ({
    page,
  }) => {
    await openFixture(page, 'status-alerts');

    const [error, warning] = await Promise.all(
      PRESETS.map(({name}) => readLayout(page, name)),
    );

    expect(warning).toEqual(error);
  });
});
