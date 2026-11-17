import {StatusCodes} from 'http-status-codes';
import {Permission} from '@repo/shared/constants/permission.js';
import {getApiUrl, getFailedRequestPattern} from '../lib/api.js';
import {
  ADMIN_ACCOUNT,
  accountFixtures,
  getTestKey,
  uniqueEmail,
} from '../lib/backend.js';
import {expect, test} from '../lib/flow-test.js';
import {
  clickRowMenuItem,
  getBulkButton,
  getColumnHeader,
  getRowCheckbox,
  getSearchBox,
  selectRows,
  sortBy,
  waitForListResponse,
} from '../lib/list-screen.js';
import {
  getBusy,
  getDialog,
  getRowButton,
  getSaveButton,
  getTableRow,
  getTableRows,
} from '../lib/locators.js';
import {MALFORMED_RECORD_ID} from '../lib/not-found.js';
import {
  PHONE_VIEWPORT,
  clickButton,
  confirmDangerous,
  expectSearchParams,
  gotoWithQuery,
} from '../lib/page.js';
import {expectToasts} from '../lib/toasts.js';

const USER_PASSWORD = 'Parola123!';

const accountTest = test.extend(accountFixtures);

function openUsers(page, query) {
  return gotoWithQuery(page, '/admin/users', query);
}

function getEmailInput(page, panel) {
  return getDialog(page, panel).getByRole('textbox', {name: 'E-posta'});
}

async function readEditDrawerHeights(page, {id, email}) {
  const {promise: landed, resolve: land} = Promise.withResolvers();
  await page.route(getApiUrl(`/users/${id}`), async route => {
    await landed;
    await route.continue();
  });
  await openUsers(page, {search: email});

  await clickRowMenuItem(page, email, 'Düzenle');

  const panel = getDialog(page, 'Kullanıcı Düzenle');
  const readHeight = () => panel.evaluate(element => element.offsetHeight);
  await expect(getBusy(panel)).toBeVisible();
  const skeleton = await readHeight();
  land();
  await expect(getEmailInput(page, 'Kullanıcı Düzenle')).toHaveValue(email);
  return {skeleton, form: await readHeight()};
}

test.describe('users list', () => {
  test('finds the seeded admin with its role and status, and its own row offers edit but neither delete nor selection', async ({
    page,
    adminRole,
  }) => {
    await openUsers(page, {search: ADMIN_ACCOUNT.email});
    const row = getTableRow(page, ADMIN_ACCOUNT.email);

    await expect(row).toContainText(adminRole.label);
    await expect(row).toContainText('Aktif');
    await expect(
      getRowButton(page, ADMIN_ACCOUNT.email, 'Düzenle'),
    ).toBeVisible();
    await expect(getRowButton(page, ADMIN_ACCOUNT.email, 'Sil')).toHaveCount(0);
    await expect(getRowCheckbox(row)).toBeDisabled();
  });

  test('a search by the unique email narrows the list and writes the URL', async ({
    page,
    backend,
  }, testInfo) => {
    const [kept, other] = await Promise.all([
      backend.createUser({email: uniqueEmail(testInfo, 'kept')}),
      backend.createUser({email: uniqueEmail(testInfo, 'other')}),
    ]);
    await openUsers(page);

    await getSearchBox(page, 'ID, E-posta…').pressSequentially(kept.email);

    await expectSearchParams(page).toEqual({search: kept.email});
    await expect(getTableRow(page, other.email)).toHaveCount(0);
    await expect(getTableRows(page)).toHaveCount(1);
    await expect(getTableRow(page, kept.email)).toBeVisible();
  });

  test('sorting by status writes the URL and orders the rows', async ({
    page,
    backend,
  }, testInfo) => {
    const [active, disabled] = await Promise.all([
      backend.createUser({email: uniqueEmail(testInfo, 'active')}),
      backend.createUser({
        email: uniqueEmail(testInfo, 'disabled'),
        disabledAt: new Date().toISOString(),
      }),
    ]);
    const search = getTestKey(testInfo);
    await openUsers(page, {search});
    const header = getColumnHeader(page, 'Durum');
    const sortUsers = async (direction, sort) => {
      const listed = waitForListResponse(
        page,
        '/users',
        params => params.get('sort') === sort,
      );
      await sortBy(header, direction);
      await listed;
    };

    await sortUsers('Artan', 'disabledAt');

    await expectSearchParams(page).toEqual({search, sort: 'disabledAt'});
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    await expect(getTableRows(page)).toContainText([
      active.email,
      disabled.email,
    ]);

    await sortUsers('Azalan', '-disabledAt');

    await expectSearchParams(page).toEqual({search, sort: '-disabledAt'});
    await expect(header).toHaveAttribute('aria-sort', 'descending');
    await expect(getTableRows(page)).toContainText([
      disabled.email,
      active.email,
    ]);
  });

  test('a page size change writes the URL and keeps the search', async ({
    page,
    backend,
  }, testInfo) => {
    await backend.createUser({email: uniqueEmail(testInfo, 'sized')});
    const search = getTestKey(testInfo);
    await openUsers(page, {search});
    const pageSize = page.getByRole('combobox', {name: 'Sayfa başına kayıt'});

    await pageSize.click();
    await page.getByRole('option', {name: '10', exact: true}).click();

    await expectSearchParams(page).toEqual({search, pageSize: '10'});
    await expect(pageSize).toContainText('10');
    await expect(page.getByRole('status').filter({hasText: ' / '})).toHaveText(
      '1-1 / 1',
    );
  });
});

test.describe('user panel', () => {
  test('create: an invalid submit marks the fields, a valid one reports once, lists the row and closes', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'created');
    await openUsers(page);

    await clickButton(page, 'Ekle');

    await expectSearchParams(page).toEqual({action: 'create'});
    const panel = getDialog(page, 'Kullanıcı Ekle');
    await getSaveButton(panel).click();

    await expect(panel.getByText('Geçersiz e-posta')).toBeVisible();
    await expect(
      panel.getByText('Parola en az 8 karakter olmalıdır'),
    ).toBeVisible();
    await expect(getEmailInput(page, 'Kullanıcı Ekle')).toBeFocused();

    await getEmailInput(page, 'Kullanıcı Ekle').pressSequentially(email);
    await panel
      .getByRole('textbox', {name: 'Parola'})
      .pressSequentially(USER_PASSWORD);
    await getSaveButton(panel).click();

    await expectToasts(page, ['Kullanıcı eklendi.']);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expectSearchParams(page).toEqual({});
    await expect(getTableRow(page, email)).toContainText('Aktif');
  });

  test.describe('when the email is taken', () => {
    test.use({
      allowedConsoleError: getFailedRequestPattern({
        '/users': [StatusCodes.CONFLICT],
      }),
    });

    test('create: the server’s conflict message is reported once and the panel keeps the values', async ({
      page,
    }) => {
      await openUsers(page, {action: 'create'});
      const panel = getDialog(page, 'Kullanıcı Ekle');

      await getEmailInput(page, 'Kullanıcı Ekle').pressSequentially(
        ADMIN_ACCOUNT.email,
      );
      await panel
        .getByRole('textbox', {name: 'Parola'})
        .pressSequentially(USER_PASSWORD);
      await getSaveButton(panel).click();

      await expectToasts(page, ['Bu e-posta zaten kullanımda.']);
      await expect(getEmailInput(page, 'Kullanıcı Ekle')).toHaveValue(
        ADMIN_ACCOUNT.email,
      );
      await expectSearchParams(page).toEqual({action: 'create'});
    });
  });

  test('edit: a changed email reports once and the row follows', async ({
    page,
    backend,
  }, testInfo) => {
    const user = await backend.createUser({
      email: uniqueEmail(testInfo, 'before'),
    });
    const email = uniqueEmail(testInfo, 'after');
    const search = getTestKey(testInfo);
    await openUsers(page, {search});

    await getRowButton(page, user.email, 'Düzenle').click();

    await expectSearchParams(page).toEqual({
      search,
      action: 'edit',
      id: user.id,
    });
    const input = getEmailInput(page, 'Kullanıcı Düzenle');
    await expect(input).toHaveValue(user.email);

    await input.clear();
    await input.pressSequentially(email);
    await getSaveButton(getDialog(page, 'Kullanıcı Düzenle')).click();

    await expectToasts(page, ['Kullanıcı güncellendi.']);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expectSearchParams(page).toEqual({search});
    await expect(getTableRow(page, email)).toBeVisible();
    await expect(getTableRow(page, user.email)).toHaveCount(0);
  });

  test('edit: the deep link survives a reload', async ({
    page,
    backend,
  }, testInfo) => {
    const user = await backend.createUser({
      email: uniqueEmail(testInfo, 'linked'),
    });

    await openUsers(page, {action: 'edit', id: user.id});

    await expect(getEmailInput(page, 'Kullanıcı Düzenle')).toHaveValue(
      user.email,
    );

    await page.reload();

    await expect(getEmailInput(page, 'Kullanıcı Düzenle')).toHaveValue(
      user.email,
    );
    await expectSearchParams(page).toEqual({action: 'edit', id: user.id});
  });

  test.describe('when the target is gone', () => {
    test.use({
      allowedConsoleError: getFailedRequestPattern({
        '/users/:id': [StatusCodes.NOT_FOUND],
      }),
    });

    test('edit: a deep link to a deleted user toasts not found and closes', async ({
      page,
      backend,
    }, testInfo) => {
      const user = await backend.createUser({
        email: uniqueEmail(testInfo, 'gone'),
      });
      await backend.deleteUser(user.id);

      await openUsers(page, {action: 'edit', id: user.id});

      await expectToasts(page, ['Kullanıcı bulunamadı.']);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expectSearchParams(page).toEqual({});
    });
  });

  test.describe('when the target id is malformed', () => {
    test.use({
      allowedConsoleError: getFailedRequestPattern({
        [`/users/${MALFORMED_RECORD_ID}`]: [StatusCodes.UNPROCESSABLE_ENTITY],
      }),
    });

    test('edit: a deep link to a malformed id toasts the server message and closes', async ({
      page,
    }) => {
      await openUsers(page, {action: 'edit', id: MALFORMED_RECORD_ID});

      await expectToasts(page, ['Geçersiz ID']);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expectSearchParams(page).toEqual({});
    });
  });
});

test.describe('deleting users', () => {
  test('a row delete asks first and reports once', async ({
    page,
    backend,
  }, testInfo) => {
    const user = await backend.createUser({
      email: uniqueEmail(testInfo, 'deleted'),
    });
    await openUsers(page, {search: getTestKey(testInfo)});

    await getRowButton(page, user.email, 'Sil').click();
    await confirmDangerous(page, `"${user.email}" kullanıcısı silinsin mi?`);

    await expectToasts(page, ['Kullanıcı silindi.']);
    await expect(getTableRow(page, user.email)).toHaveCount(0);
    expect(await backend.findUser(user.email)).toBeNull();
  });

  test('a bulk delete of two users reports once and clears the selection', async ({
    page,
    backend,
  }, testInfo) => {
    const emails = [
      uniqueEmail(testInfo, 'bulk-a'),
      uniqueEmail(testInfo, 'bulk-b'),
    ];
    await Promise.all(emails.map(email => backend.createUser({email})));
    await openUsers(page, {search: getTestKey(testInfo)});

    await selectRows(page, emails);
    await getBulkButton(page, 'Sil').click();
    await confirmDangerous(page, '2 kullanıcı silinsin mi?');

    await expectToasts(page, ['Seçili kullanıcılar silindi.']);
    await Promise.all(
      emails.map(email => expect(getTableRow(page, email)).toHaveCount(0)),
    );
    await expect(getBulkButton(page, 'Sil')).toHaveCount(0);
  });

  accountTest.describe('after the viewer loses its permission', () => {
    accountTest.use({
      allowedConsoleError: getFailedRequestPattern({
        '/users': [StatusCodes.FORBIDDEN],
        '/users/:id': [StatusCodes.FORBIDDEN],
      }),
    });

    accountTest(
      'a bulk delete reports the tally once and keeps the refused rows',
      async ({page, backend, account}, testInfo) => {
        const users = await Promise.all(
          ['tally-a', 'tally-b'].map(prefix =>
            backend.createUser({email: uniqueEmail(testInfo, prefix)}),
          ),
        );
        const emails = users.map(user => user.email);
        await openUsers(page, {search: getTestKey(testInfo)});
        await selectRows(page, emails);

        await backend.updateRole(account.roleId, {permissions: []});
        await getBulkButton(page, 'Sil').click();
        await confirmDangerous(page, '2 kullanıcı silinsin mi?');

        await expectToasts(page, ['0/2 kullanıcı silindi.']);

        await backend.updateRole(account.roleId, {
          permissions: [Permission.ADMIN],
        });
        await clickButton(page, 'Yeniden dene');

        await Promise.all(
          emails.map(email => expect(getTableRow(page, email)).toBeVisible()),
        );
      },
    );
  });
});

test.describe('at a phone width', () => {
  test.use({viewport: PHONE_VIEWPORT});

  test('the sidebar stays closed until the header control opens it, and a link closes it', async ({
    page,
  }) => {
    await openUsers(page);
    await expect(
      page.getByRole('heading', {name: 'Kullanıcılar'}),
    ).toBeVisible();
    await expect(page.getByRole('link', {name: 'Roller'})).toHaveCount(0);

    await page.getByRole('button', {name: 'Menü', exact: true}).click();

    const sidebar = page.getByRole('dialog', {name: 'Sidebar'});
    await expect(sidebar).toBeVisible();

    await sidebar.getByRole('link', {name: 'Roller'}).click();

    await expect(page).toHaveURL(/\/admin\/roles$/);
    await expect(sidebar).toHaveCount(0);
  });

  test('the create panel renders as a drawer', async ({page}) => {
    await openUsers(page);

    await clickButton(page, 'Ekle');

    await expect(getDialog(page, 'Kullanıcı Ekle')).toHaveAttribute(
      'data-slot',
      'drawer-popup',
    );
    await expect(getEmailInput(page, 'Kullanıcı Ekle')).toBeVisible();
  });

  test('the edit drawer of another user keeps its height when the record lands', async ({
    page,
    backend,
  }, testInfo) => {
    const user = await backend.createUser({
      email: uniqueEmail(testInfo, 'drawer'),
    });

    const {skeleton, form} = await readEditDrawerHeights(page, user);

    expect(skeleton).toBe(form);
  });

  accountTest(
    'the edit drawer of the signed-in user keeps its height when the record lands',
    async ({page, account}) => {
      const {skeleton, form} = await readEditDrawerHeights(page, account);

      expect(skeleton).toBe(form);
    },
  );

  test('row actions move into a menu and pagination hides previous and next', async ({
    page,
    backend,
  }, testInfo) => {
    await Promise.all(
      Array.from({length: 11}, (_, index) =>
        backend.createUser({email: uniqueEmail(testInfo, `page-${index}`)}),
      ),
    );
    await openUsers(page, {search: getTestKey(testInfo), pageSize: 10});
    const pagination = page.getByRole('navigation', {name: 'Sayfalama'});

    await expect(
      pagination.getByRole('link', {name: '2', exact: true}),
    ).toBeVisible();
    await expect(
      pagination.getByRole('link', {name: 'Son sayfa'}),
    ).toBeVisible();
    await expect(pagination.getByLabel('Önceki sayfa')).toBeHidden();
    await expect(pagination.getByLabel('Sonraki sayfa')).toBeHidden();
    await expect(
      getTableRows(page).first().getByRole('button', {name: 'İşlemler'}),
    ).toBeVisible();
  });
});
