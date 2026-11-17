import {openFixture} from '../lib/fixture-page.js';
import {expect, test} from '../lib/test.js';

function getList(page, name) {
  return page.getByRole('group', {name});
}

function readColumnCount(list) {
  return list
    .getByRole('term')
    .evaluateAll(
      terms =>
        new Set(terms.map(term => Math.round(term.getBoundingClientRect().x)))
          .size,
    );
}

function readTops(locator) {
  return locator.evaluateAll(elements =>
    elements.map(element => Math.round(element.getBoundingClientRect().y)),
  );
}

test.describe('description list', () => {
  test('pairs every term with its details', async ({page}) => {
    await openFixture(page, 'detail-view');
    const list = getList(page, 'Dar liste');

    await expect(list.getByRole('term')).toHaveText([
      'Ad',
      'E-posta',
      'Rol',
      'Anahtar',
    ]);
    await expect(list.getByRole('definition').first()).toHaveText('Ada Yılmaz');
    await expect(list.getByRole('definition')).toHaveCount(4);
  });

  test('lays its items in columns that follow its own width', async ({
    page,
  }) => {
    await openFixture(page, 'detail-view');

    await expect
      .poll(async () => [
        await readColumnCount(getList(page, 'Dar liste')),
        await readColumnCount(getList(page, 'Orta liste')),
        await readColumnCount(getList(page, 'Geniş liste')),
      ])
      .toEqual([1, 2, 4]);
  });

  test('wraps a long value inside its item rather than overflowing it', async ({
    page,
  }) => {
    await openFixture(page, 'detail-view');
    const value = getList(page, 'Dar liste').getByRole('definition').last();

    expect(
      await value.evaluate(
        element => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  });

  test('the horizontal orientation sets each term beside its details and flows the items', async ({
    page,
  }) => {
    await openFixture(page, 'detail-view');
    const list = getList(page, 'Yatay liste');

    const [termTops, detailTops] = await Promise.all([
      readTops(list.getByRole('term')),
      readTops(list.getByRole('definition')),
    ]);

    expect(termTops[0]).toBe(detailTops[0]);
    expect(termTops[0]).toBe(termTops[1]);
  });
});

test.describe('page section', () => {
  test('is a region named by its heading, its actions beside the heading', async ({
    page,
  }) => {
    await openFixture(page, 'detail-view');
    const section = page.getByRole('region', {name: 'Oturumlar'});

    await expect(
      section.getByRole('heading', {level: 2, name: 'Oturumlar'}),
    ).toBeVisible();
    await expect(section).toContainText('Son girişler');
    await expect(
      section.getByRole('button', {name: 'Tümünü kapat'}),
    ).toBeVisible();
    await expect(section).toContainText('Bölüm içeriği.');
  });
});

test.describe('page header skeleton', () => {
  test('stands in for the title while busy, as tall as the header it stands for', async ({
    page,
  }) => {
    await openFixture(page, 'detail-view');
    const loaded = page.getByTestId('loaded-header');
    const loading = page.getByTestId('loading-header');

    await expect(
      loaded.getByRole('heading', {level: 1, name: 'Ada Yılmaz'}),
    ).toBeVisible();
    await expect(loading.getByRole('heading')).toHaveCount(0);
    await expect(
      loading.getByRole('status', {name: 'Yükleniyor'}),
    ).toBeAttached();
    await expect(loading).toContainText('Kullanıcı ayrıntısı');
    expect(
      await loading
        .getByRole('button', {name: 'Düzenle'})
        .evaluate(button => button.closest('[aria-busy="true"]')),
    ).toBeNull();

    const [loadedBox, loadingBox] = await Promise.all([
      loaded.boundingBox(),
      loading.boundingBox(),
    ]);
    expect(loadingBox.height).toBe(loadedBox.height);
  });
});
