import {openFixture} from '../lib/fixture-page.js';
import {expect, test} from '../lib/test.js';

function getSample(page, label) {
  return page.getByRole('group', {name: label, exact: true});
}

function getTime(page, label) {
  return getSample(page, label).locator('time');
}

test.use({timezoneId: 'UTC'});

test.describe('date and time', () => {
  test('a date-time and a clock time render in the app locale and carry the instant', async ({
    page,
  }) => {
    await openFixture(page, 'date-time');

    await expect(getTime(page, 'Tarih ve saat')).toHaveText('3 Haz 2024 10:04');
    await expect(getTime(page, 'Tarih')).toHaveText('3 Haz 2024');
    await expect(getTime(page, 'Saat')).toHaveText('10:04:05');
    await expect(getTime(page, 'Saat')).toHaveAttribute(
      'datetime',
      '2024-06-03T10:04:05.000Z',
    );
  });

  test('a missing instant renders nothing', async ({page}) => {
    await openFixture(page, 'date-time');

    await expect(getSample(page, 'Saat yok')).toBeEmpty();
  });
});

test.describe('duration', () => {
  test('spells out only the units it spans, milliseconds below a second', async ({
    page,
  }) => {
    await openFixture(page, 'date-time');

    await expect(getTime(page, 'Kısa süre')).toHaveText('250 msn');
    await expect(getTime(page, 'Saniyeler')).toHaveText('45 sn.');
    await expect(getTime(page, 'Saatler')).toHaveText('1 sa. 2 dk. 3 sn.');
    await expect(getTime(page, 'Günler')).toHaveText('2 gün 3 sa.');
  });

  test('carries the duration as a machine-readable value', async ({page}) => {
    await openFixture(page, 'date-time');

    await expect(getTime(page, 'Kısa süre')).toHaveAttribute(
      'datetime',
      'PT0.25S',
    );
    await expect(getTime(page, 'Saatler')).toHaveAttribute(
      'datetime',
      'PT1H2M3S',
    );
    await expect(getTime(page, 'Günler')).toHaveAttribute('datetime', 'P2DT3H');
  });

  test('rounds a span just short of a second up to the second, in both its forms', async ({
    page,
  }) => {
    await openFixture(page, 'date-time');

    await expect(getTime(page, 'Neredeyse saniye')).toHaveText('1 sn.');
    await expect(getTime(page, 'Neredeyse saniye')).toHaveAttribute(
      'datetime',
      'PT1S',
    );
  });

  test.describe('on a browser without Intl.DurationFormat', () => {
    test.beforeEach(async ({page}) => {
      await page.addInitScript(() => {
        delete Intl.DurationFormat;
      });
    });

    test('spells the units out the same way through the unit formatters', async ({
      page,
    }) => {
      await openFixture(page, 'date-time');

      await expect(getTime(page, 'Kısa süre')).toHaveText('250 msn');
      await expect(getTime(page, 'Saniyeler')).toHaveText('45 sn.');
      await expect(getTime(page, 'Saatler')).toHaveText('1 sa. 2 dk. 3 sn.');
      await expect(getTime(page, 'Günler')).toHaveText('2 gün 3 sa.');
    });
  });

  test('reads a negative span as zero and a missing one as nothing', async ({
    page,
  }) => {
    await openFixture(page, 'date-time');

    await expect(getTime(page, 'Ters süre')).toHaveText('0 msn');
    await expect(getSample(page, 'Süre yok')).toBeEmpty();
  });
});
