import {pick} from 'es-toolkit';
import {settingsDefinition} from '@repo/shared/schemas/setting.js';
import {uniqueName} from '../lib/backend.js';
import {expect, test as base} from '../lib/flow-test.js';
import {getSaveButton} from '../lib/locators.js';
import {expectUnloadAsked, expectUnloadUnasked} from '../lib/page.js';
import {recordApiRequests} from '../lib/requests.js';
import {expectToasts} from '../lib/toasts.js';

const SETTINGS_PATH = '/settings';
const POLL_TIMEOUT = 20_000;

const test = base.extend({
  originalSettings: [
    async ({backend}, use) => {
      const original = pick(
        await backend.readSettings(),
        Object.keys(settingsDefinition.editableSchema.shape),
      );
      await use(original);
      await backend.updateSettings(original);
    },
    {scope: 'test'},
  ],
});

function getNameInput(page) {
  return page.getByRole('textbox', {name: 'Uygulama Adı'});
}

function getJobCountInput(page) {
  return page.getByRole('spinbutton', {name: 'İş Sayısı'});
}

async function replaceName(page, name) {
  await getNameInput(page).clear();
  await getNameInput(page).pressSequentially(name);
}

function getPatchBodies(requests) {
  return requests
    .filter(request => request.method() === 'PATCH')
    .map(request => request.postDataJSON());
}

test.beforeEach(async ({page, originalSettings}) => {
  await page.goto('/admin/settings');
  await expect(getNameInput(page)).toHaveValue(originalSettings.name);
});

test('a saved name reports once and survives a reload', async ({
  page,
}, testInfo) => {
  const name = uniqueName(testInfo, 'app');

  await replaceName(page, name);
  await getSaveButton(page).click();

  await expectToasts(page, ['Ayarlar güncellendi.']);

  await page.reload();

  await expect(getNameInput(page)).toHaveValue(name);
});

test('saving an unchanged form reports that nothing changed', async ({
  page,
}) => {
  await getSaveButton(page).click();

  await expectToasts(page, ['Değişiklik yok.']);
});

test('a dirty form asks before unloading, and a save releases it', async ({
  page,
}, testInfo) => {
  const name = uniqueName(testInfo, 'guarded');
  await replaceName(page, name);

  await expectUnloadAsked(page);

  await expect(getNameInput(page)).toHaveValue(name);

  await getSaveButton(page).click();
  await expectToasts(page, ['Ayarlar güncellendi.']);

  await expectUnloadUnasked(page);
});

test('switching the job on asks for a positive job count before saving', async ({
  page,
}) => {
  const jobCount = getJobCountInput(page);
  const message = page.getByText(
    'İş aktifken iş sayısı sıfırdan büyük olmalıdır',
  );
  await jobCount.clear();
  await jobCount.pressSequentially('0');

  await page.getByRole('checkbox', {name: 'İş Aktif'}).check();

  await expect(message).toBeVisible();
  await expect(jobCount).toHaveAttribute('aria-invalid', 'true');

  await getSaveButton(page).click();

  await expect(jobCount).toBeFocused();
  await expectToasts(page, []);

  await jobCount.pressSequentially('3');

  await expect(message).toHaveCount(0);
});

test('a nested change keeps the sibling the server changed meanwhile', async ({
  page,
  backend,
}) => {
  const jobCount = getJobCountInput(page);
  await backend.updateSettings({job: {count: 1, isEnabled: false}});
  await page.reload();
  await expect(jobCount).toHaveValue('1');

  await jobCount.clear();
  await jobCount.pressSequentially('5');
  await backend.updateSettings({job: {isEnabled: true}});
  await getSaveButton(page).click();

  await expectToasts(page, ['Ayarlar güncellendi.']);
  expect((await backend.readSettings()).job).toEqual({
    count: 5,
    isEnabled: true,
  });
  await expect(page.getByRole('checkbox', {name: 'İş Aktif'})).toBeChecked();
});

test.describe('while the page polls the server', () => {
  test.describe.configure({timeout: 60_000});

  test('a change made elsewhere lands in a clean field and leaves it clean', async ({
    page,
    backend,
  }, testInfo) => {
    const name = uniqueName(testInfo, 'polled');

    await backend.updateSettings({name});

    await expect(getNameInput(page)).toHaveValue(name, {
      timeout: POLL_TIMEOUT,
    });

    await getSaveButton(page).click();

    await expectToasts(page, ['Değişiklik yok.']);
    await expectUnloadUnasked(page);
  });

  test('a change made elsewhere never overwrites a field being edited', async ({
    page,
    backend,
    originalSettings,
  }, testInfo) => {
    const draft = uniqueName(testInfo, 'draft');
    const count = originalSettings.job.count + 1;

    await replaceName(page, draft);
    await backend.updateSettings({
      name: uniqueName(testInfo, 'remote'),
      job: {count},
    });

    await expect(getJobCountInput(page)).toHaveValue(String(count), {
      timeout: POLL_TIMEOUT,
    });
    await expect(getNameInput(page)).toHaveValue(draft);
  });
});

test('saving over a change made elsewhere asks first, and only an overwrite sends it', async ({
  page,
  backend,
}, testInfo) => {
  const draft = uniqueName(testInfo, 'draft');
  const question = page.getByRole('alertdialog', {
    name: 'Aşağıdaki ayarlar arka planda değiştirilmiş.',
  });
  const requests = recordApiRequests(page, SETTINGS_PATH);

  await replaceName(page, draft);
  await backend.updateSettings({name: uniqueName(testInfo, 'remote')});
  await getSaveButton(page).click();

  await expect(question).toContainText('• Genel › Uygulama Adı');
  await question.getByRole('button', {name: 'Vazgeç'}).click();

  await expect(question).toBeHidden();
  await expect(getNameInput(page)).toHaveValue(draft);
  expect(getPatchBodies(requests)).toEqual([]);
  await expectUnloadAsked(page);

  await getSaveButton(page).click();
  await question.getByRole('button', {name: 'Üzerine Yaz'}).click();

  await expectToasts(page, ['Ayarlar güncellendi.']);
  expect(getPatchBodies(requests)).toEqual([{name: draft}]);
  expect((await backend.readSettings()).name).toBe(draft);
});
