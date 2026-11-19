import {StatusCodes} from 'http-status-codes';
import {ErrorCode} from '@repo/shared/constants/error-code.js';
import {
  ENTRY,
  SERVER_MESSAGE,
  openAlerts,
  stubEntries,
} from '../lib/alerts-fixture.js';
import {
  FALLBACK_SUCCESS_MESSAGE,
  getErrorEnvelope,
  getFailedRequestPattern,
  getSuccessEnvelope,
  getValidationEnvelope,
} from '../lib/api.js';
import {expectFixtureState} from '../lib/fixture-page.js';
import {getLoadingStatus, getTopLoader} from '../lib/locators.js';
import {clickButton} from '../lib/page.js';
import {expect, test} from '../lib/test.js';
import {expectToasts, getToasts} from '../lib/toasts.js';

const FAILURE_MESSAGE = 'Kayıt eklenemedi.';
const INVALID_MESSAGE = 'Ad gerekli.';
const ENTRY_SERVER_ERROR = getFailedRequestPattern({
  '/fixtures/entries': [StatusCodes.INTERNAL_SERVER_ERROR],
});

function getAlertDialog(page, name) {
  return page.getByRole('alertdialog', {name});
}

function stubServerError(page) {
  return stubEntries(page, {
    status: StatusCodes.INTERNAL_SERVER_ERROR,
    json: getErrorEnvelope(FAILURE_MESSAGE, ErrorCode.INTERNAL_ERROR),
  });
}

test.describe('app alert', () => {
  test.beforeEach(async ({page}) => {
    await openAlerts(page);
  });

  test('confirm opens an alertdialog and blocks until it is confirmed, then resolves true', async ({
    page,
  }) => {
    await clickButton(page, 'Onay iste');

    const dialog = getAlertDialog(page, 'İşleme devam edilsin mi?');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button')).toHaveText(['Cancel', 'Confirm']);
    await expectFixtureState(page).toMatchObject({
      outcomes: {confirm: {status: 'pending'}},
    });

    await dialog.getByRole('button', {name: 'Confirm'}).click();

    await expect(dialog).toBeHidden();
    await expectFixtureState(page).toMatchObject({
      outcomes: {confirm: {status: 'fulfilled', value: true}},
    });
  });

  test('cancelling or pressing Escape resolves the confirm false', async ({
    page,
  }) => {
    const dialog = getAlertDialog(page, 'İşleme devam edilsin mi?');
    await clickButton(page, 'Onay iste');
    await dialog.getByRole('button', {name: 'Cancel'}).click();

    await expect(dialog).toBeHidden();
    await expectFixtureState(page).toMatchObject({
      outcomes: {confirm: {status: 'fulfilled', value: false}},
    });

    await clickButton(page, 'Onay iste');
    await expectFixtureState(page).toMatchObject({
      outcomes: {confirm: {status: 'pending'}},
    });
    await page.keyboard.press('Escape');

    await expect(dialog).toBeHidden();
    await expectFixtureState(page).toMatchObject({
      outcomes: {confirm: {status: 'fulfilled', value: false}},
    });
  });

  test('confirmDangerous carries the irreversibility warning and a “Continue” confirm', async ({
    page,
  }) => {
    await clickButton(page, 'Tehlikeli onay iste');

    const dialog = getAlertDialog(page, 'Kayıt kalıcı olarak silinsin mi?');
    await expect(dialog).toHaveAccessibleDescription(
      'This action cannot be undone.',
    );
    await expect(dialog.getByRole('button')).toHaveText(['Cancel', 'Continue']);

    await dialog.getByRole('button', {name: 'Continue'}).click();

    await expectFixtureState(page).toMatchObject({
      outcomes: {dangerous: {status: 'fulfilled', value: true}},
    });
  });

  test('an info alert offers only an acknowledgement and blocks until it is given', async ({
    page,
  }) => {
    await clickButton(page, 'Bilgi ver');

    const dialog = getAlertDialog(page, 'Rapor hazır');
    await expect(dialog).toHaveAccessibleDescription(
      'Rapor e-posta adresinize gönderildi.',
    );
    await expect(dialog.getByRole('button')).toHaveText(['OK']);
    await expectFixtureState(page).toMatchObject({
      outcomes: {info: {status: 'pending'}},
    });

    await dialog.getByRole('button', {name: 'OK'}).click();

    await expect(dialog).toBeHidden();
    await expectFixtureState(page).toMatchObject({
      outcomes: {info: {status: 'fulfilled'}},
    });
  });

  test('a confirm driving a mutation stays open and pending until it settles, then shows its success alert', async ({
    page,
  }) => {
    const {promise, resolve} = Promise.withResolvers();
    const hits = await stubEntries(page, {until: promise});
    const dialog = getAlertDialog(page, 'Kayıt silinsin mi?');
    await clickButton(page, 'Kaydı sil');

    await dialog.getByRole('button', {name: 'Continue'}).click();

    const pendingButton = dialog.getByRole('button', {name: 'Siliniyor…'});
    await expect(pendingButton).toBeDisabled();
    await expect(getLoadingStatus(pendingButton)).toBeVisible();
    await expect(dialog.getByRole('button', {name: 'Cancel'})).toBeDisabled();
    await expect.poll(() => hits).toHaveLength(1);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expectFixtureState(page).toMatchObject({
      outcomes: {removal: {status: 'pending'}},
    });

    resolve();

    await expect(dialog).toBeHidden();
    const success = getAlertDialog(page, 'Kayıt silindi.');
    await expect(success.getByRole('button')).toHaveText(['OK']);
    await expectFixtureState(page).toMatchObject({
      outcomes: {removal: {status: 'fulfilled', value: true}},
      mutations: {removal: 'success'},
    });
    await expectToasts(page, []);

    await success.getByRole('button', {name: 'OK'}).click();

    await expect(success).toBeHidden();
  });

  test.describe('with a failing action', () => {
    test.use({allowedConsoleError: ENTRY_SERVER_ERROR});

    test('a confirm renders the rejection as its own error alert, with no toast', async ({
      page,
    }) => {
      await stubServerError(page);
      await clickButton(page, 'Kaydı sil');

      await getAlertDialog(page, 'Kayıt silinsin mi?')
        .getByRole('button', {name: 'Continue'})
        .click();

      await expect(getAlertDialog(page, FAILURE_MESSAGE)).toBeVisible();
      await expectFixtureState(page).toMatchObject({
        outcomes: {removal: {status: 'fulfilled', value: false}},
        mutations: {removal: 'error'},
      });
      await expectToasts(page, []);
    });
  });
});

test.describe('withToast', () => {
  test.beforeEach(async ({page}) => {
    await openAlerts(page);
  });

  test('shows the pending text, then the success text, and the toast stays until dismissed', async ({
    page,
  }) => {
    const {promise, resolve} = Promise.withResolvers();
    await stubEntries(page, {until: promise});

    await clickButton(page, 'Görevi başlat');

    await expectToasts(page, ['Görev çalışıyor…']);
    await expectFixtureState(page).toMatchObject({
      outcomes: {task: {status: 'pending'}},
    });

    resolve();

    const taskToast = getToasts(page).filter({hasText: 'Görev tamamlandı.'});
    await expect(taskToast).toBeVisible();
    await expectFixtureState(page).toMatchObject({
      outcomes: {task: {status: 'fulfilled', value: {message: SERVER_MESSAGE}}},
    });

    await clickButton(page, 'Kaydet');
    await page.mouse.move(0, 0);
    const autoClosing = getToasts(page).filter({hasText: SERVER_MESSAGE});
    await expect(autoClosing).toBeVisible();
    await expect(autoClosing).toHaveCount(0, {timeout: 10_000});

    await expect(taskToast).toBeVisible();
  });

  test.describe('with a failing promise', () => {
    test.use({allowedConsoleError: ENTRY_SERVER_ERROR});

    test('shows the error text and rejects', async ({page}) => {
      await stubServerError(page);

      await clickButton(page, 'Görevi başlat');

      await expectToasts(page, ['Görev başarısız.']);
      await expectFixtureState(page).toMatchObject({
        outcomes: {
          task: {
            status: 'rejected',
            error: {
              message: FAILURE_MESSAGE,
              status: StatusCodes.INTERNAL_SERVER_ERROR,
            },
          },
        },
      });
    });
  });
});

test.describe('mutation toasts', () => {
  test.beforeEach(async ({page}) => {
    await openAlerts(page);
  });

  test('a route that sends a message produces exactly one success toast carrying it, and the api-layer callback does not count as a report', async ({
    page,
  }) => {
    await stubEntries(page);

    await clickButton(page, 'Kaydet');

    await expectFixtureState(page).toMatchObject({
      mutations: {plain: 'success'},
      ledger: {lastEntry: ENTRY},
    });
    await expectToasts(page, [SERVER_MESSAGE]);
  });

  test('a success envelope without a message produces no toast', async ({
    page,
  }) => {
    await stubEntries(page, {json: getSuccessEnvelope(ENTRY, null)});

    await clickButton(page, 'Kaydet');

    await expectFixtureState(page).toMatchObject({
      mutations: {plain: 'success'},
    });
    await expectToasts(page, []);
  });

  test('a route left on the generic fallback message still produces exactly one success toast carrying it', async ({
    page,
  }) => {
    await stubEntries(page, {json: getSuccessEnvelope(ENTRY)});

    await clickButton(page, 'Kaydet');

    await expectFixtureState(page).toMatchObject({
      mutations: {plain: 'success'},
    });
    await expectToasts(page, [FALLBACK_SUCCESS_MESSAGE]);
  });

  test('a caller declaring onSuccess reports success itself, so no global toast appears, while the api-layer callback still runs', async ({
    page,
  }) => {
    await stubEntries(page);

    await clickButton(page, 'Kaydet, çağıran bildirsin');

    await expectFixtureState(page).toMatchObject({
      mutations: {handled: 'success'},
      callbacks: {handledSuccess: 1},
      ledger: {lastEntry: ENTRY},
    });
    await expectToasts(page, []);
  });

  test('lifecycle callbacks compose hook first: the caller’s onSuccess already sees what the hook’s wrote', async ({
    page,
  }) => {
    await stubEntries(page);

    await clickButton(page, 'Kaydet, çağıran bildirsin');

    await expectFixtureState(page).toMatchObject({
      callbacks: {handledSuccess: 1},
      entryAtCallback: ENTRY,
    });
  });

  test.describe('with a caller onMutate beside the hook’s own', () => {
    test.use({
      allowedConsoleError:
        /onMutate is owned by the hook and cannot be overridden\./,
    });

    test('the merge refuses it with an error', async ({page}) => {
      await clickButton(page, 'Çağıran onMutate tanımlasın');

      await expect(
        page.getByRole('alert').filter({
          hasText: 'onMutate is owned by the hook and cannot be overridden.',
        }),
      ).toBeVisible();
    });
  });

  test('toast: true brings the global toast back despite a caller onSuccess', async ({
    page,
  }) => {
    await stubEntries(page);

    await clickButton(page, 'Kaydet, bildirimi zorla');

    await expectFixtureState(page).toMatchObject({
      mutations: {forced: 'success'},
      callbacks: {forcedSuccess: 1},
    });
    await expectToasts(page, [SERVER_MESSAGE]);
  });

  test('toast: false silences the success toast without a caller callback', async ({
    page,
  }) => {
    await stubEntries(page);

    await clickButton(page, 'Kaydet, bildirimi kapat');

    await expectFixtureState(page).toMatchObject({
      mutations: {silenced: 'success'},
    });
    await expectToasts(page, []);
  });

  test('useToastMutation reports through its own toasts only and never raises the top loader', async ({
    page,
  }) => {
    const {promise, resolve} = Promise.withResolvers();
    const hits = await stubEntries(page, {until: promise});

    await clickButton(page, 'Bildirimli kaydet');

    await expectToasts(page, ['Gönderiliyor…']);
    await expect.poll(() => hits).toHaveLength(1);
    await expectFixtureState(page).toMatchObject({
      mutations: {toasted: 'pending'},
    });
    await expect(getTopLoader(page)).toHaveCount(0);

    resolve();

    await expectFixtureState(page).toMatchObject({
      mutations: {toasted: 'success'},
    });
    await expectToasts(page, ['Gönderildi.']);
  });

  test('the top loader is visible while a slow mutation is pending', async ({
    page,
  }) => {
    const {promise, resolve} = Promise.withResolvers();
    const hits = await stubEntries(page, {until: promise});
    await expect(getTopLoader(page)).toHaveCount(0);

    await clickButton(page, 'Kaydet');

    await expect(getTopLoader(page)).toBeVisible();
    await expect.poll(() => hits).toHaveLength(1);

    resolve();

    await expectFixtureState(page).toMatchObject({
      mutations: {plain: 'success'},
    });
    await expect(getTopLoader(page)).toHaveCount(0);
  });

  test('declared invalidation lands before the caller’s own callback runs', async ({
    page,
  }) => {
    await stubEntries(page);

    await clickButton(page, 'Kaydet ve yenile');

    await expectFixtureState(page).toMatchObject({
      mutations: {invalidating: 'success'},
      ledger: {fetchCount: 2},
      ledgerAtCallback: 2,
    });
  });

  test.describe('with a 500', () => {
    test.use({allowedConsoleError: ENTRY_SERVER_ERROR});

    test.beforeEach(async ({page}) => {
      await stubServerError(page);
    });

    test('an error response produces exactly one error toast', async ({
      page,
    }) => {
      await clickButton(page, 'Kaydet');

      await expectFixtureState(page).toMatchObject({
        mutations: {plain: 'error'},
      });
      await expectToasts(page, [FAILURE_MESSAGE]);
    });

    test('a caller declaring only onSuccess still gets the global error toast', async ({
      page,
    }) => {
      await clickButton(page, 'Kaydet, çağıran bildirsin');

      await expectFixtureState(page).toMatchObject({
        mutations: {handled: 'error'},
      });
      await expectToasts(page, [FAILURE_MESSAGE]);
    });

    test('toast: false silences the error toast too', async ({page}) => {
      await clickButton(page, 'Kaydet, bildirimi kapat');

      await expectFixtureState(page).toMatchObject({
        mutations: {silenced: 'error'},
      });
      await expectToasts(page, []);
    });

    test('a form-bound mutation still toasts an error that is not a validation error', async ({
      page,
    }) => {
      await clickButton(page, 'Formdan kaydet');

      await expectFixtureState(page).toMatchObject({
        mutations: {formBound: 'error'},
      });
      await expectToasts(page, [FAILURE_MESSAGE]);
    });

    test('a mutation that renders a failure itself gets no global toast for it', async ({
      page,
    }) => {
      await clickButton(page, 'Kaydet, hatayı kendisi göstersin');

      await expectFixtureState(page).toMatchObject({
        mutations: {rendered: 'error'},
      });
      await expectToasts(page, []);
    });

    test('a mutation still gets the global toast for a failure it does not render', async ({
      page,
    }) => {
      await clickButton(page, 'Kaydet, başka hatayı göstersin');

      await expectFixtureState(page).toMatchObject({
        mutations: {otherRendered: 'error'},
      });
      await expectToasts(page, [FAILURE_MESSAGE]);
    });

    test('useToastMutation shows its own error text instead of the global toast', async ({
      page,
    }) => {
      await clickButton(page, 'Bildirimli kaydet');

      await expectFixtureState(page).toMatchObject({
        mutations: {toasted: 'error'},
      });
      await expectToasts(page, ['Gönderilemedi.']);
    });

    test('only a mutation that invalidates on settle refetches after a failure', async ({
      page,
    }) => {
      await clickButton(page, 'Kaydet ve yenile');
      await expectFixtureState(page).toMatchObject({
        mutations: {invalidating: 'error'},
      });

      await clickButton(page, 'Kaydet, her durumda yenile');

      await expectFixtureState(page).toMatchObject({
        mutations: {settling: 'error'},
        ledger: {fetchCount: 2},
      });
    });
  });

  test.describe('with a 422', () => {
    test.use({
      allowedConsoleError: getFailedRequestPattern({
        '/fixtures/entries': [StatusCodes.UNPROCESSABLE_ENTITY],
      }),
    });

    test.beforeEach(async ({page}) => {
      await stubEntries(page, {
        status: StatusCodes.UNPROCESSABLE_ENTITY,
        json: getValidationEnvelope([
          {field: 'name', message: INVALID_MESSAGE},
        ]),
      });
    });

    test('a form-bound mutation leaves the validation error to its form: no global toast', async ({
      page,
    }) => {
      await clickButton(page, 'Formdan kaydet');

      await expectFixtureState(page).toMatchObject({
        mutations: {formBound: 'error'},
      });
      await expectToasts(page, []);
    });

    test('a mutation that is not form-bound toasts the validation message', async ({
      page,
    }) => {
      await clickButton(page, 'Kaydet');

      await expectFixtureState(page).toMatchObject({
        mutations: {plain: 'error'},
      });
      await expectToasts(page, [INVALID_MESSAGE]);
    });
  });
});
