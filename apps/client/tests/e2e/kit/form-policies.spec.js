import {StatusCodes} from 'http-status-codes';
import {
  getApiUrl,
  getFailedRequestPattern,
  getSuccessEnvelope,
  getValidationEnvelope,
  stubApi,
} from '../lib/api.js';
import {expectFixtureState, openFixture} from '../lib/fixture-page.js';
import {
  getForm,
  getFormField,
  getLoadingStatus,
  getSaveButton,
} from '../lib/locators.js';
import {expectUnloadAsked, expectUnloadUnasked, retype} from '../lib/page.js';
import {expect, test} from '../lib/test.js';
import {expectToasts} from '../lib/toasts.js';

const ENDPOINT_PATH = '/fixtures/form-policies';
const ENDPOINT = getApiUrl(ENDPOINT_PATH);
const DISPLAY_FORM = 'Görüntüleme formu';
const SERVER_FORM = 'Sunucu formu';
const SERVER_LIST_FORM = 'Sunucu liste formu';
const DRAFT_FORM = 'Taslak formu';
const COMPUTED_FORM = 'Hesaplama formu';
const PASSWORD_FORM = 'Parola formu';
const SECRET_FORM = 'Gizli alan formu';
const ENDPOINT_FORM = 'Uç nokta formu';
const HOST_MESSAGE = 'Sunucu gerekli';
const PORT_MESSAGE = 'Port bir sayı olmalı';
const PLAN_DESCRIPTION = 'Faturalama planı.';
const NAME_MESSAGE = 'Ad en az 2 karakter olmalı';
const EMAIL_MESSAGE = 'Geçerli bir e-posta girin';
const PHONE_MESSAGE = 'Telefon en az 10 haneli olmalı';
const PLAN_MESSAGE = 'Bir plan seçin';
const MISMATCH_MESSAGE = 'Parolalar eşleşmiyor';
const ALL_DISPLAY_MESSAGES = [
  NAME_MESSAGE,
  EMAIL_MESSAGE,
  PHONE_MESSAGE,
  PLAN_MESSAGE,
];
const TAKEN_MESSAGE = 'Kullanıcı adı alınmış.';
const FORM_MESSAGE = 'Kayıt şu an yapılamıyor.';
const UNKNOWN_FIELD_MESSAGE = 'Bu kayıt reddedildi.';
const FAILED_SUBMIT_ERROR = getFailedRequestPattern({
  [ENDPOINT_PATH]: [StatusCodes.UNPROCESSABLE_ENTITY],
});

function getServerSaveButton(page) {
  return getSaveButton(getForm(page, SERVER_FORM));
}

async function fillValidDisplayTexts(page) {
  await getFormField(page, DISPLAY_FORM, 'Ad').pressSequentially('Ayşe');
  await getFormField(page, DISPLAY_FORM, 'E-posta').pressSequentially('a@b.co');
}

async function fillValidDisplayFields(page) {
  await fillValidDisplayTexts(page);
  await getForm(page, DISPLAY_FORM)
    .getByRole('button', {name: 'Temel'})
    .click();
}

function stubSuccess(page, until) {
  return stubApi(page, ENDPOINT, async () => {
    await until;
    return {json: getSuccessEnvelope()};
  });
}

function stubValidationFailure(page, errors) {
  return stubApi(page, ENDPOINT, () => ({
    status: StatusCodes.UNPROCESSABLE_ENTITY,
    json: getValidationEnvelope(errors),
  }));
}

async function restubSuccess(page) {
  await page.unroute(ENDPOINT);
  return stubSuccess(page);
}

function retypeUsername(page, username) {
  return retype(getFormField(page, SERVER_FORM, 'Kullanıcı adı'), username);
}

test.describe('form policies', () => {
  test.beforeEach(async ({page}) => {
    await openFixture(page, 'form-policies');
  });

  test('by default shows a field error only once the field was edited and left', async ({
    page,
  }) => {
    const form = getForm(page, DISPLAY_FORM);
    const name = getFormField(page, DISPLAY_FORM, 'Ad');
    const email = getFormField(page, DISPLAY_FORM, 'E-posta');

    await name.pressSequentially('A');

    await expectFixtureState(page).toMatchObject({
      display: {
        fields: {
          name: {value: 'A', error: NAME_MESSAGE},
          email: {error: EMAIL_MESSAGE},
        },
      },
    });
    await expect(form.getByRole('alert')).toHaveCount(0);
    await expect(name).toHaveAttribute('aria-invalid', 'false');

    await name.press('Tab');

    await expect(email).toBeFocused();
    await expect(form.getByRole('alert')).toHaveText([NAME_MESSAGE]);
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveAccessibleDescription(NAME_MESSAGE);

    await email.press('Tab');

    await expect(form.getByRole('alert')).toHaveText([NAME_MESSAGE]);
    await expect(email).toHaveAttribute('aria-invalid', 'false');
  });

  test('a submit click that reveals the error of the field it leaves still submits', async ({
    page,
  }) => {
    const form = getForm(page, DISPLAY_FORM);
    await getFormField(page, DISPLAY_FORM, 'Ad').pressSequentially('A');

    await form.getByRole('button', {name: 'Doğrula'}).click();

    await expect(form.getByRole('alert')).toHaveText(ALL_DISPLAY_MESSAGES);
    await expectFixtureState(page).toMatchObject({
      display: {submissionAttempts: 1},
    });
  });

  test('a held press of another mouse button never holds back a keyboard leave', async ({
    page,
  }) => {
    const form = getForm(page, DISPLAY_FORM);
    const name = getFormField(page, DISPLAY_FORM, 'Ad');
    await name.pressSequentially('A');
    const box = await name.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down({button: 'right'});

    await name.press('Tab');

    await expect(form.getByRole('alert')).toHaveText([NAME_MESSAGE]);
    await page.mouse.up({button: 'right'});
  });

  test('a submit without edits runs every validator, shows every error and focuses the first invalid control', async ({
    page,
  }) => {
    const form = getForm(page, DISPLAY_FORM);

    await form.getByRole('button', {name: 'Doğrula'}).click();

    await expect(form.getByRole('alert')).toHaveText(ALL_DISPLAY_MESSAGES);
    await expect(getFormField(page, DISPLAY_FORM, 'Ad')).toBeFocused();
    await expectFixtureState(page).toMatchObject({
      display: {isValid: false, submissionAttempts: 1},
    });
  });

  test('a field unmounted after failing drops its error while the form stays invalid', async ({
    page,
  }) => {
    const form = getForm(page, DISPLAY_FORM);
    await fillValidDisplayFields(page);
    await form.getByRole('button', {name: 'Doğrula'}).click();
    await expect(form.getByRole('alert')).toHaveText([PHONE_MESSAGE]);
    await expect(getFormField(page, DISPLAY_FORM, 'Telefon')).toBeFocused();

    await page.getByRole('button', {name: 'Telefon alanını kaldır'}).click();

    await expect(getFormField(page, DISPLAY_FORM, 'Telefon')).toHaveCount(0);
    await expect(form.getByRole('alert')).toHaveCount(0);
    await expectFixtureState(page).toMatchObject({
      display: {
        isPhoneShown: false,
        isValid: false,
        fields: {phone: {error: null}},
      },
    });

    await form.getByRole('button', {name: 'Doğrula'}).click();

    await expectFixtureState(page).toMatchObject({
      display: {
        isValid: false,
        submissionAttempts: 2,
        fields: {phone: {error: PHONE_MESSAGE}},
      },
    });
  });

  test.describe('with a cross-field error held back until a submit', () => {
    function getPasswordSubmit(page) {
      return getForm(page, PASSWORD_FORM).getByRole('button', {
        name: 'Parolayı doğrula',
      });
    }

    test('a submit click reveals it on the untouched field and moves the focus there', async ({
      page,
    }) => {
      const password = getFormField(page, PASSWORD_FORM, 'Parola');
      const repeat = getFormField(page, PASSWORD_FORM, 'Parola (Tekrar)');
      await password.pressSequentially('gizli');
      await expect(repeat).toHaveAttribute('aria-invalid', 'false');

      await getPasswordSubmit(page).click();

      await expect(repeat).toHaveAttribute('aria-invalid', 'true');
      await expect(repeat).toHaveAccessibleDescription(MISMATCH_MESSAGE);
      await expect(repeat).toBeFocused();
    });

    test('Enter right after typing the mismatch reveals it on the field still being typed', async ({
      page,
    }) => {
      const repeat = getFormField(page, PASSWORD_FORM, 'Parola (Tekrar)');
      await getFormField(page, PASSWORD_FORM, 'Parola').pressSequentially(
        'gizli',
      );
      await repeat.pressSequentially('gizlx');
      await expect(repeat).toHaveAttribute('aria-invalid', 'false');

      await repeat.press('Enter');

      await expect(repeat).toHaveAttribute('aria-invalid', 'true');
      await expect(repeat).toHaveAccessibleDescription(MISMATCH_MESSAGE);
      await expect(repeat).toBeFocused();
    });
  });

  test.describe('with write-only fields an edit form may leave blank', () => {
    function getSecretField(page, label) {
      return getFormField(page, SECRET_FORM, label);
    }

    function getSecretSubmit(page) {
      return getForm(page, SECRET_FORM).getByRole('button', {
        name: 'Anahtarı kaydet',
      });
    }

    test('left blank, they pass validation and stay out of the submitted values', async ({
      page,
    }) => {
      await getSecretSubmit(page).click();

      await expectFixtureState(page, 'secret').toEqual({
        payload: {name: 'Servis'},
      });
    });

    test('a filled one is still held to its own rule', async ({page}) => {
      const secret = getSecretField(page, 'Anahtar');
      await secret.pressSequentially('kisa');

      await getSecretSubmit(page).click();

      await expect(secret).toHaveAttribute('aria-invalid', 'true');
      await expect(secret).toHaveAccessibleDescription(
        'Anahtar en az 8 karakter olmalı',
      );
      await expectFixtureState(page, 'secret').toEqual({payload: null});
    });

    test('the cross-field check the schema carries still runs', async ({
      page,
    }) => {
      const repeat = getSecretField(page, 'Anahtar (Tekrar)');
      await getSecretField(page, 'Anahtar').pressSequentially('gizli-anahtar');

      await getSecretSubmit(page).click();

      await expect(repeat).toHaveAttribute('aria-invalid', 'true');
      await expect(repeat).toHaveAccessibleDescription('Anahtarlar eşleşmiyor');
      await expectFixtureState(page, 'secret').toEqual({payload: null});
    });

    test('filled in, they are submitted as typed', async ({page}) => {
      await getSecretField(page, 'Anahtar').pressSequentially('gizli-anahtar');
      await getSecretField(page, 'Anahtar (Tekrar)').pressSequentially(
        'gizli-anahtar',
      );

      await getSecretSubmit(page).click();

      await expectFixtureState(page, 'secret').toEqual({
        payload: {
          name: 'Servis',
          secret: 'gizli-anahtar',
          repeat: 'gizli-anahtar',
        },
      });
    });
  });

  test('FormFieldMessage renders a bare control’s message in a slot of its own', async ({
    page,
  }) => {
    const form = getForm(page, DISPLAY_FORM);
    const plan = form.getByRole('group', {name: 'Plan'});

    await expect(plan).toHaveAccessibleDescription(PLAN_DESCRIPTION);

    await form.getByRole('button', {name: 'Doğrula'}).click();

    await expect(form.getByText(PLAN_MESSAGE)).toBeVisible();
    await expect(form.getByText(PLAN_DESCRIPTION)).toHaveCount(0);
    await expect(plan).toHaveAttribute('aria-invalid', 'true');
    await expect(plan).toHaveAccessibleDescription(PLAN_MESSAGE);

    await plan.getByRole('button', {name: 'Temel'}).click();

    await expect(plan).toHaveAttribute('aria-invalid', 'false');
    await expect(plan).toHaveAccessibleDescription(PLAN_DESCRIPTION);
  });

  test('TextControl binds a bare input whose message renders in a slot of its own', async ({
    page,
  }) => {
    const form = getForm(page, ENDPOINT_FORM);
    const host = form.getByRole('textbox', {name: 'Sunucu'});
    const port = form.getByRole('textbox', {name: 'Port'});

    await form.getByRole('button', {name: 'Uç noktayı doğrula'}).click();

    await expect(form.getByRole('alert')).toHaveText([
      HOST_MESSAGE,
      PORT_MESSAGE,
    ]);
    await expect(host).toHaveAttribute('aria-invalid', 'true');
    await expect(host).toHaveAccessibleDescription(HOST_MESSAGE);
    await expect(port).toHaveAccessibleDescription(PORT_MESSAGE);
    await expect(host).toBeFocused();

    await host.pressSequentially('api');
    await port.pressSequentially('8080');

    await expect(host).toHaveAttribute('aria-invalid', 'false');
    await expect(port).toHaveAttribute('aria-invalid', 'false');
    await expect(form.getByRole('alert')).toHaveCount(0);
  });

  test('a failed submit whose first invalid control is a group moves the focus into it', async ({
    page,
  }) => {
    const form = getForm(page, DISPLAY_FORM);
    await fillValidDisplayTexts(page);
    await getFormField(page, DISPLAY_FORM, 'Telefon').pressSequentially(
      '5551234567',
    );

    await form.getByRole('button', {name: 'Doğrula'}).click();

    await Promise.all([
      expect(form.getByRole('button', {name: 'Temel'})).toBeFocused(),
      expect(form.getByText(PLAN_MESSAGE)).toBeVisible(),
    ]);
  });

  test.describe('with a 422 from the server', () => {
    test.use({allowedConsoleError: FAILED_SUBMIT_ERROR});

    test.beforeEach(async ({page}) => {
      await stubValidationFailure(page, [
        {field: 'username', message: TAKEN_MESSAGE},
        {field: '', message: FORM_MESSAGE},
      ]);
    });

    test('maps the named field and a field-less error to a form-level message, with no global toast', async ({
      page,
    }) => {
      const username = getFormField(page, SERVER_FORM, 'Kullanıcı adı');

      await getServerSaveButton(page).click();

      await expect(username).toHaveAttribute('aria-invalid', 'true');
      await expect(username).toHaveAccessibleDescription(TAKEN_MESSAGE);
      await expect(username).toBeFocused();
      await expect(
        getForm(page, SERVER_FORM).getByRole('alert').filter({
          hasText: FORM_MESSAGE,
        }),
      ).toBeVisible();
      await expect(page.getByText(TAKEN_MESSAGE, {exact: true})).toHaveCount(1);
      await expectFixtureState(page).toMatchObject({
        server: {
          formError: FORM_MESSAGE,
          fields: {username: {error: TAKEN_MESSAGE}},
        },
      });
    });

    test('editing the field clears both errors and the next submit reaches the server', async ({
      page,
    }) => {
      const username = getFormField(page, SERVER_FORM, 'Kullanıcı adı');
      await getServerSaveButton(page).click();
      await expect(username).toHaveAttribute('aria-invalid', 'true');
      const hits = await restubSuccess(page);

      await retypeUsername(page, 'ayse2');

      await expect(username).toHaveAttribute('aria-invalid', 'false');
      await expect(getForm(page, SERVER_FORM).getByRole('alert')).toHaveCount(
        0,
      );

      await getServerSaveButton(page).click();

      await expect
        .poll(() => hits.map(hit => hit.body))
        .toEqual([{username: 'ayse2', email: 'ayse@example.com'}]);
      await expectFixtureState(page).toMatchObject({
        server: {formError: null, isValid: true, isSubmitting: false},
      });
    });

    test('a refused save leaves the form dirty', async ({page}) => {
      const username = getFormField(page, SERVER_FORM, 'Kullanıcı adı');
      await retypeUsername(page, 'ayse2');

      await getServerSaveButton(page).click();

      await expect(username).toHaveAttribute('aria-invalid', 'true');
      await expectFixtureState(page).toMatchObject({server: {isDirty: true}});
    });
  });

  test.describe('with a 422 naming an array item by its dotted path', () => {
    test.use({allowedConsoleError: FAILED_SUBMIT_ERROR});

    test('shows the message under the item field, with no toast', async ({
      page,
    }) => {
      await stubValidationFailure(page, [
        {field: 'people.1.name', message: TAKEN_MESSAGE},
      ]);
      const secondPerson = getFormField(page, SERVER_LIST_FORM, 'Kişi 2');

      await getSaveButton(getForm(page, SERVER_LIST_FORM)).click();

      await expect(secondPerson).toHaveAttribute('aria-invalid', 'true');
      await expect(secondPerson).toHaveAccessibleDescription(TAKEN_MESSAGE);
      await expect(
        getFormField(page, SERVER_LIST_FORM, 'Kişi 1'),
      ).toHaveAttribute('aria-invalid', 'false');
      await expectToasts(page, []);
    });
  });

  test.describe('with a 422 naming a field the form lacks', () => {
    test.use({allowedConsoleError: FAILED_SUBMIT_ERROR});

    test('reports the message in one error toast, attaches it nowhere and lets the next submit through', async ({
      page,
    }) => {
      await stubValidationFailure(page, [
        {field: 'ghost', message: UNKNOWN_FIELD_MESSAGE},
      ]);

      await getServerSaveButton(page).click();

      await expectToasts(page, [UNKNOWN_FIELD_MESSAGE]);
      await expect(getForm(page, SERVER_FORM).getByRole('alert')).toHaveCount(
        0,
      );
      await expect(
        getFormField(page, SERVER_FORM, 'Kullanıcı adı'),
      ).toHaveAttribute('aria-invalid', 'false');
      await expectFixtureState(page).toMatchObject({
        server: {formError: null, isValid: true},
      });

      const hits = await restubSuccess(page);
      await retypeUsername(page, 'ayse2');
      await getServerSaveButton(page).click();

      await expect
        .poll(() => hits.map(hit => hit.body))
        .toEqual([{username: 'ayse2', email: 'ayse@example.com'}]);
    });
  });

  test('the submit button is busy and disabled while the mutation is pending', async ({
    page,
  }) => {
    const {promise, resolve} = Promise.withResolvers();
    const hits = await stubSuccess(page, promise);
    const save = getServerSaveButton(page);

    await save.click();

    await expect(save).toBeDisabled();
    await expect(getLoadingStatus(save)).toBeVisible();
    await expectFixtureState(page).toMatchObject({
      server: {isSubmitting: true},
    });
    await expect.poll(() => hits).toHaveLength(1);

    resolve();

    await expect(save).toBeEnabled();
    await expect(save.getByRole('status')).toHaveCount(0);
    await expectFixtureState(page).toMatchObject({
      server: {isSubmitting: false},
    });
  });

  test('a saved form is clean again and keeps the saved values', async ({
    page,
  }) => {
    const hits = await stubSuccess(page);
    await retypeUsername(page, 'ayse2');
    await expectFixtureState(page).toMatchObject({server: {isDirty: true}});

    await getServerSaveButton(page).click();

    await expect.poll(() => hits).toHaveLength(1);
    await expectFixtureState(page).toMatchObject({
      server: {isDirty: false, isSubmitting: false},
    });
    await expect(getFormField(page, SERVER_FORM, 'Kullanıcı adı')).toHaveValue(
      'ayse2',
    );
  });

  test('an edit made while the save is pending stays unsaved', async ({
    page,
  }) => {
    const {promise, resolve} = Promise.withResolvers();
    const hits = await stubSuccess(page, promise);
    const username = getFormField(page, SERVER_FORM, 'Kullanıcı adı');
    await retypeUsername(page, 'ayse2');

    await getServerSaveButton(page).click();
    await expect.poll(() => hits).toHaveLength(1);
    await username.fill('ayse3');
    resolve();

    await expectFixtureState(page).toMatchObject({
      server: {isDirty: true, isSubmitting: false},
    });
    await expect(username).toHaveValue('ayse3');
  });

  test('a save resolving null leaves the form dirty', async ({page}) => {
    await openFixture(page, 'form-policies', {isSaveSkipped: true});
    const hits = await stubSuccess(page);
    await retypeUsername(page, 'ayse2');

    await getServerSaveButton(page).click();

    await expectFixtureState(page).toMatchObject({
      server: {isDirty: true, isSubmitting: false, submissionAttempts: 1},
    });
    expect(hits).toEqual([]);
  });

  test('a computed field follows its sources through their change listeners', async ({
    page,
  }) => {
    const price = getFormField(page, COMPUTED_FORM, 'Fiyat');
    const quantity = getFormField(page, COMPUTED_FORM, 'Adet');
    const total = getFormField(page, COMPUTED_FORM, 'Toplam');

    await price.pressSequentially('12.5');

    await expect(total).toHaveValue('12.5');

    await retype(quantity, '3');

    await expect(total).toHaveValue('37.5');
    await expectFixtureState(page).toMatchObject({
      computed: {fields: {total: {value: 37.5, type: 'number'}}},
    });
  });

  test('a source keeps the value typed into it, the computed field never writing it back', async ({
    page,
  }) => {
    await getFormField(page, COMPUTED_FORM, 'Fiyat').pressSequentially('0.1');
    await retype(getFormField(page, COMPUTED_FORM, 'Adet'), '3');

    await expectFixtureState(page).toMatchObject({
      computed: {
        fields: {
          price: {value: 0.1},
          quantity: {value: 3},
          total: {value: 0.1 * 3},
        },
      },
    });
  });

  test('editing the computed field writes its source back and keeps the value typed into it', async ({
    page,
  }) => {
    await retype(getFormField(page, COMPUTED_FORM, 'Adet'), '49');

    await retype(getFormField(page, COMPUTED_FORM, 'Toplam'), '1');

    await expectFixtureState(page).toMatchObject({
      computed: {
        fields: {
          price: {value: 1 / 49},
          quantity: {value: 49},
          total: {value: 1},
        },
      },
    });
  });

  test('two forms keep disjoint control ids and submitting one leaves the other unvalidated', async ({
    page,
  }) => {
    const hits = await stubSuccess(page);
    const [displayId, serverId] = await Promise.all([
      getFormField(page, DISPLAY_FORM, 'E-posta').getAttribute('id'),
      getFormField(page, SERVER_FORM, 'E-posta').getAttribute('id'),
    ]);
    expect(displayId).toBeTruthy();
    expect(serverId).toBeTruthy();
    expect(displayId).not.toBe(serverId);

    await getServerSaveButton(page).click();

    await expect.poll(() => hits).toHaveLength(1);
    await expectFixtureState(page).toMatchObject({
      display: {submissionAttempts: 0},
      server: {isSubmitting: false},
    });
    await expect(getForm(page, DISPLAY_FORM).getByRole('alert')).toHaveCount(0);
  });

  test.describe('unsaved changes guard', () => {
    test('a dirty form asks before unloading, and dismissing keeps the page and the edit', async ({
      page,
    }) => {
      const title = getFormField(page, DRAFT_FORM, 'Başlık');
      await title.pressSequentially('Taslak');
      await expectFixtureState(page).toMatchObject({draft: {isDirty: true}});

      await expectUnloadAsked(page);

      await expect(title).toHaveValue('Taslak');
    });

    test('a dirty form leaves once the unload is confirmed', async ({page}) => {
      await getFormField(page, DRAFT_FORM, 'Başlık').pressSequentially(
        'Taslak',
      );
      await expectFixtureState(page).toMatchObject({draft: {isDirty: true}});
      const dialog = page.waitForEvent('dialog');
      const closed = page.waitForEvent('close');

      await page.close({runBeforeUnload: true});
      await (await dialog).accept();

      await closed;
      expect(page.isClosed()).toBe(true);
    });

    test('a clean form unloads without asking', async ({page}) => {
      await getFormField(page, DRAFT_FORM, 'Başlık').click();

      await expectUnloadUnasked(page);
    });
  });
});

test.describe('form error display policies', () => {
  test('onChange shows every error as soon as validation runs, while the field is still being typed', async ({
    page,
  }) => {
    await openFixture(page, 'form-policies', {errorDisplay: 'onChange'});
    const name = getFormField(page, DISPLAY_FORM, 'Ad');

    await name.pressSequentially('A');

    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(getForm(page, DISPLAY_FORM).getByRole('alert')).toHaveText(
      ALL_DISPLAY_MESSAGES,
    );
  });

  test('onTouched shows an error once its field is left, even without an edit', async ({
    page,
  }) => {
    await openFixture(page, 'form-policies', {errorDisplay: 'onTouched'});
    const alerts = getForm(page, DISPLAY_FORM).getByRole('alert');
    const name = getFormField(page, DISPLAY_FORM, 'Ad');
    const email = getFormField(page, DISPLAY_FORM, 'E-posta');

    await name.pressSequentially('A');
    await expect(alerts).toHaveCount(0);
    await name.press('Tab');
    await expect(alerts).toHaveText([NAME_MESSAGE]);

    await email.press('Tab');

    await expect(alerts).toHaveText([NAME_MESSAGE, EMAIL_MESSAGE]);
    await expect(email).toHaveAttribute('aria-invalid', 'true');
  });

  test('onSubmit keeps errors hidden after an edit and leave until a submit', async ({
    page,
  }) => {
    await openFixture(page, 'form-policies', {errorDisplay: 'onSubmit'});
    const form = getForm(page, DISPLAY_FORM);
    const name = getFormField(page, DISPLAY_FORM, 'Ad');

    await name.pressSequentially('A');
    await name.press('Tab');

    await expectFixtureState(page).toMatchObject({
      display: {fields: {name: {error: NAME_MESSAGE}}},
    });
    await expect(form.getByRole('alert')).toHaveCount(0);
    await expect(name).toHaveAttribute('aria-invalid', 'false');

    await form.getByRole('button', {name: 'Doğrula'}).click();

    await expect(form.getByRole('alert')).toHaveText(ALL_DISPLAY_MESSAGES);
    await expect(name).toHaveAttribute('aria-invalid', 'true');
  });
});
