import {StatusCodes} from 'http-status-codes';
import {Permission} from '@repo/shared/constants/permission.js';
import {getFailedRequestPattern} from '../lib/api.js';
import {expectNoSession} from '../lib/auth.js';
import {
  ADMIN_ACCOUNT,
  accountFixtures,
  getTestKey,
  uniqueEmail,
  uniqueName,
} from '../lib/backend.js';
import {expect, test as base} from '../lib/flow-test.js';
import {getNoRecords} from '../lib/list-screen.js';
import {getRowButton, getTableRow, getTableRows} from '../lib/locators.js';
import {clickButton, expectSearchParams, gotoWithQuery} from '../lib/page.js';
import {PANEL_ROUTES} from '../lib/routes.js';
import {expectToasts} from '../lib/toasts.js';

const test = base.extend({
  ...accountFixtures,
  scene: [null, {option: true}],
  account: [async ({scene}, use) => use(scene.viewer), {scope: 'test'}],
});

test.describe('without the admin permission', () => {
  test.use({
    scene: [
      async ({backend}, use, testInfo) => {
        const role = await backend.createRole({
          name: uniqueName(testInfo, 'no-panel'),
          permissions: [Permission.USER_MANAGE_PEER],
        });
        const viewer = await backend.createUser({
          email: uniqueEmail(testInfo, 'no-panel'),
          roleIds: [role.id],
        });
        await use({viewer});
      },
      {scope: 'test'},
    ],
  });

  test('every panel route renders the forbidden boundary instead of the shell', async ({
    page,
  }) => {
    for (const route of PANEL_ROUTES) {
      await page.goto(route);

      await expect(
        page.getByRole('heading', {name: 'Erişim engellendi!'}),
      ).toBeVisible();
      await expect(
        page.getByText('Bu sayfayı görüntüleme yetkiniz yok.'),
      ).toBeVisible();
      await expect(
        page.getByText(String(StatusCodes.FORBIDDEN), {exact: true}),
      ).toBeVisible();
      await expect(
        page.getByRole('button', {name: 'Menü', exact: true}),
      ).toHaveCount(0);
    }
  });

  test('the forbidden boundary signs out to the login screen', async ({
    page,
  }) => {
    await page.goto('/admin');

    await clickButton(page, 'Çıkış yap');

    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin$/);
    await expectNoSession(page);
  });
});

test.describe('below another admin role', () => {
  test.use({
    scene: [
      async ({backend, adminRole}, use, testInfo) => {
        const upperRole = await backend.createRole({
          name: uniqueName(testInfo, 'upper'),
          permissions: [Permission.ADMIN],
          anchorRoleId: adminRole.id,
        });
        const viewerRole = await backend.createRole({
          name: uniqueName(testInfo, 'viewer'),
          permissions: [Permission.ADMIN],
          anchorRoleId: upperRole.id,
        });
        const lowerRole = await backend.createRole({
          name: uniqueName(testInfo, 'lower'),
          anchorRoleId: viewerRole.id,
        });
        const [viewer, upper, lower] = await Promise.all(
          [
            ['viewer', viewerRole],
            ['upper', upperRole],
            ['lower', lowerRole],
          ].map(([prefix, role]) =>
            backend.createUser({
              email: uniqueEmail(testInfo, prefix),
              roleIds: [role.id],
            }),
          ),
        );
        await use({viewer, upper, lower, upperRole, viewerRole, lowerRole});
      },
      {scope: 'test'},
    ],
  });

  test('the users list leaves out whoever is above reach and keeps the viewer’s own row', async ({
    page,
    scene,
  }, testInfo) => {
    await gotoWithQuery(page, '/admin/users', {search: getTestKey(testInfo)});

    await expect(getRowButton(page, scene.lower.email, 'Sil')).toBeVisible();
    await expect(
      getRowButton(page, scene.lower.email, 'Düzenle'),
    ).toBeVisible();
    await expect(
      getRowButton(page, scene.viewer.email, 'Düzenle'),
    ).toBeVisible();
    await expect(getRowButton(page, scene.viewer.email, 'Sil')).toHaveCount(0);
    await expect(getTableRow(page, scene.upper.email)).toHaveCount(0);
    await expect(getTableRows(page)).toHaveCount(2);

    await gotoWithQuery(page, '/admin/users', {search: ADMIN_ACCOUNT.email});

    await expect(getNoRecords(page)).toBeVisible();
  });

  test('the viewer’s own edit panel narrows to email and password', async ({
    page,
    scene,
  }) => {
    await gotoWithQuery(page, '/admin/users', {
      action: 'edit',
      id: scene.viewer.id,
    });
    const panel = page.getByRole('dialog', {name: 'Kullanıcı Düzenle'});

    await expect(panel.getByRole('textbox', {name: 'E-posta'})).toHaveValue(
      scene.viewer.email,
    );
    await expect(panel.getByRole('textbox', {name: 'Parola'})).toBeVisible();
    await expect(panel.getByRole('combobox', {name: 'Roller'})).toHaveCount(0);
    await expect(
      panel.getByRole('checkbox', {name: 'Aktif Kullanıcı'}),
    ).toHaveCount(0);
  });

  test('the role options offer only roles below the viewer', async ({
    page,
    scene,
  }, testInfo) => {
    await gotoWithQuery(page, '/admin/users', {action: 'create'});

    await page
      .getByRole('dialog', {name: 'Kullanıcı Ekle'})
      .getByRole('combobox', {name: 'Roller'})
      .click();

    await expect(
      page.getByRole('option').filter({hasText: getTestKey(testInfo)}),
    ).toHaveText([scene.lowerRole.label]);
  });

  test('the roles list leaves out the viewer’s own role and every role above it', async ({
    page,
    scene,
  }, testInfo) => {
    await gotoWithQuery(page, '/admin/roles', {search: getTestKey(testInfo)});

    await expect(
      getRowButton(page, scene.lowerRole.label, 'Sil'),
    ).toBeVisible();
    await expect(getTableRow(page, scene.viewerRole.label)).toHaveCount(0);
    await expect(getTableRow(page, scene.upperRole.label)).toHaveCount(0);
    await expect(getTableRows(page)).toHaveCount(1);
  });

  test.describe('reaching past the list', () => {
    test.use({
      allowedConsoleError: getFailedRequestPattern({
        '/users/:id': [StatusCodes.NOT_FOUND],
      }),
    });

    test('a deep link to edit a user above reach answers not found', async ({
      page,
      scene,
    }) => {
      await gotoWithQuery(page, '/admin/users', {
        action: 'edit',
        id: scene.upper.id,
      });

      await expectToasts(page, ['Kullanıcı bulunamadı.']);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expectSearchParams(page).toEqual({});
    });
  });
});
