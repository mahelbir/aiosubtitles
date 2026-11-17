import {openFixture} from '../lib/fixture-page.js';
import {getDialog} from '../lib/locators.js';
import {expect, test} from '../lib/test.js';

const LOG = 'Bağlantı kuruldu.\nİstek gönderildi.\nYanıt alındı.';
const TOKEN_SELECTOR = 'code span[style*="--shiki-light"]';

function getViewer(page, section) {
  return page.getByRole('region', {name: section});
}

function getCopyButton(scope) {
  return scope.getByRole('button', {name: 'Copy', exact: true});
}

function readClipboard(page) {
  return page.evaluate(() => navigator.clipboard.readText());
}

function readScrollBox(scope) {
  return scope.locator('pre').evaluate(node => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
  }));
}

test.describe('code viewer', () => {
  test.beforeEach(({context}) =>
    context.grantPermissions(['clipboard-read', 'clipboard-write']),
  );

  test('copies the whole text and announces it', async ({page}) => {
    await openFixture(page, 'code-viewer');
    const viewer = getViewer(page, 'Düz metin');

    await getCopyButton(viewer).click();

    await expect(viewer.getByRole('button', {name: 'Copied'})).toBeVisible();
    await expect(viewer.getByText('Copied')).toBeAttached();
    expect(await readClipboard(page)).toBe(LOG);
  });

  test('a browser without clipboard access fails the copy quietly', async ({
    page,
  }) => {
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'clipboard', {value: undefined}),
    );
    await openFixture(page, 'code-viewer');
    const viewer = getViewer(page, 'Düz metin');

    await getCopyButton(viewer).click();

    await expect(getCopyButton(viewer)).toBeVisible();
    await expect(viewer.getByText('Copied')).toHaveCount(0);
  });

  test('highlights a known language and leaves plain text as written', async ({
    page,
  }) => {
    await openFixture(page, 'code-viewer');

    await expect(
      getViewer(page, 'JSON yanıt').locator(TOKEN_SELECTOR).first(),
    ).toBeAttached();
    await expect(
      getViewer(page, 'Düz metin').locator(TOKEN_SELECTOR),
    ).toHaveCount(0);
    await expect(getViewer(page, 'Düz metin').locator('pre')).toHaveText(
      LOG.replaceAll('\n', ''),
    );
  });

  test('caps the inline text and scrolls the rest', async ({page}) => {
    await openFixture(page, 'code-viewer');

    const box = await readScrollBox(getViewer(page, 'JSON yanıt'));

    expect(box.clientHeight).toBeLessThanOrEqual(256);
    expect(box.scrollHeight).toBeGreaterThan(box.clientHeight);
  });

  test('opens the whole text full screen under its title, where it copies too', async ({
    page,
  }) => {
    await openFixture(page, 'code-viewer');

    await getViewer(page, 'JSON yanıt')
      .getByRole('button', {name: 'Full screen'})
      .click();

    const dialog = getDialog(page, 'Yanıt');
    await expect
      .poll(async () => (await dialog.boundingBox())?.width)
      .toBe(page.viewportSize().width - 64);
    const box = await readScrollBox(dialog);
    expect(box.scrollHeight).toBe(box.clientHeight);

    await getCopyButton(dialog).click();

    await expect(dialog.getByRole('button', {name: 'Copied'})).toBeVisible();
    expect(JSON.parse(await readClipboard(page)).items).toHaveLength(30);
  });
});
