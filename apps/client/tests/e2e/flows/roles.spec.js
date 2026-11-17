import {Permission} from '@repo/shared/constants/permission.js';
import {RoleDirection} from '@repo/shared/constants/role.js';
import {ADMIN_ROLE_SLUG} from '../../../../api/src/db/seeders/00001-roles.js';
import {getApiUrl} from '../lib/api.js';
import {getTestKey, uniqueEmail, uniqueName} from '../lib/backend.js';
import {DIALOG_SELECTOR} from '../lib/fixture-page.js';
import {expect, test} from '../lib/flow-test.js';
import {clickRowMenuItem} from '../lib/list-screen.js';
import {
  getDialog,
  getRowButton,
  getSaveButton,
  getTableRow,
  getTableRows,
} from '../lib/locators.js';
import {
  MALFORMED_RECORD_ID,
  MISSING_RECORD_ID,
  getMissingRecordPattern,
} from '../lib/not-found.js';
import {
  PHONE_VIEWPORT,
  confirmDangerous,
  expectHeightsToGlide,
  expectSearchParams,
  gotoWithQuery,
  readBoxes,
  recordBoxes,
  settleAnimations,
} from '../lib/page.js';
import {expectToasts} from '../lib/toasts.js';

const ADMIN_PERMISSION_LABEL = Permission.label(Permission.ADMIN);
const PEER_PERMISSION_LABEL = Permission.label(Permission.USER_MANAGE_PEER);
const LOCK_LABEL = 'Kilitli';
const RECORD_LATENCY_MS = 250;

function openRoles(page, query) {
  return gotoWithQuery(page, '/admin/roles', query);
}

function getPermission(page, label) {
  return page.getByRole('checkbox', {name: label, exact: true});
}

function getLockedCellName(role) {
  return `${role.label} ${LOCK_LABEL}`;
}

test('the locked role carries its lock in its name, offers only adding near it, and its edit link explains why', async ({
  page,
  adminRole,
}) => {
  await openRoles(page, {search: ADMIN_ROLE_SLUG});

  await expect(
    getTableRow(page, getLockedCellName(adminRole)).getByRole('img', {
      name: LOCK_LABEL,
    }),
  ).toBeVisible();
  await expect(
    getRowButton(page, getLockedCellName(adminRole), 'Buraya ekle'),
  ).toBeVisible();
  await expect(
    getTableRow(page, getLockedCellName(adminRole)).getByRole('button'),
  ).toHaveCount(1);

  await openRoles(page, {action: 'edit', id: adminRole.id});

  const panel = getDialog(page, 'Rol Düzenle');
  await expect(panel).toContainText('Bu rol üzerinde işlem yapamazsınız.');
  await expect(getSaveButton(panel)).toHaveCount(0);
});

test.describe('when the target is missing or malformed', () => {
  test.use({allowedConsoleError: getMissingRecordPattern('/roles')});

  test('edit: a deep link to a missing or a malformed id toasts the server message and closes', async ({
    page,
  }) => {
    for (const {id, message} of [
      {id: MISSING_RECORD_ID, message: 'Rol bulunamadı.'},
      {id: MALFORMED_RECORD_ID, message: 'Geçersiz ID'},
    ]) {
      await openRoles(page, {action: 'edit', id});

      await expectToasts(page, [message]);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expectSearchParams(page).toEqual({});
    }
  });
});

test('creating next to a role: validation, then one toast, and the role lists its rank, label and key', async ({
  page,
  adminRole,
}, testInfo) => {
  const name = uniqueName(testInfo, 'created');
  await openRoles(page, {search: ADMIN_ROLE_SLUG});

  await getRowButton(page, getLockedCellName(adminRole), 'Buraya ekle').click();

  await expectSearchParams(page).toEqual({
    search: ADMIN_ROLE_SLUG,
    action: 'create',
    anchor: adminRole.id,
  });
  const panel = getDialog(page, 'Rol Ekle');
  const placement = panel.getByRole('group', {name: 'Konum'});
  await expect(placement.getByRole('button', {name: 'Altına'})).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(placement.getByRole('button', {name: 'Üstüne'})).toBeDisabled();
  await expect(
    placement.getByRole('button', {name: 'Aynı seviyeye'}),
  ).toBeDisabled();
  await expect(
    panel.getByText(`"${adminRole.label}" rolüne göre`),
  ).toBeVisible();

  await getSaveButton(panel).click();

  await expect(panel.getByText('Ad en az 2 karakter olmalıdır')).toBeVisible();
  await expect(panel.getByRole('textbox', {name: 'Ad'})).toBeFocused();

  await panel.getByRole('textbox', {name: 'Ad'}).pressSequentially(name);
  await panel.getByRole('textbox', {name: 'Anahtar'}).pressSequentially(name);
  await panel.getByRole('checkbox', {name: 'Genel tümünü seç'}).check();

  await expect(panel.getByRole('button', {name: 'Genel 1/1'})).toBeVisible();

  await getSaveButton(panel).click();

  await expectToasts(page, ['Rol eklendi.']);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectSearchParams(page).toEqual({search: ADMIN_ROLE_SLUG});

  await openRoles(page, {search: name});

  await expect(getTableRow(page, name).getByRole('cell')).toHaveText([
    '2',
    name,
    name,
    '',
  ]);

  await getRowButton(page, name, 'Düzenle').click();

  await expect(getPermission(page, ADMIN_PERMISSION_LABEL)).toBeChecked();
  await expect(
    getDialog(page, 'Rol Düzenle').getByRole('button', {
      name: 'Kullanıcılar 0/1',
    }),
  ).toBeVisible();
});

test('edited permissions persist after a reload', async ({
  page,
  backend,
  adminRole,
}, testInfo) => {
  const role = await backend.createRole({
    name: uniqueName(testInfo, 'edited'),
    permissions: [Permission.ADMIN],
    anchorRoleId: adminRole.id,
  });
  await openRoles(page, {search: role.slug});

  await getRowButton(page, role.label, 'Düzenle').click();

  await expectSearchParams(page).toEqual({
    search: role.slug,
    action: 'edit',
    id: role.id,
  });
  const panel = getDialog(page, 'Rol Düzenle');
  await expect(panel.getByRole('textbox', {name: 'Ad'})).toHaveValue(
    role.label,
  );
  await expect(getPermission(page, ADMIN_PERMISSION_LABEL)).toBeChecked();

  await panel.getByRole('button', {name: 'Kullanıcılar 0/1'}).click();
  await getPermission(page, PEER_PERMISSION_LABEL).check();
  await getSaveButton(panel).click();

  await expectToasts(page, ['Rol güncellendi.']);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.reload();
  await getRowButton(page, role.label, 'Düzenle').click();

  await expect(panel.getByRole('button', {name: 'Genel 1/1'})).toBeVisible();
  await expect(
    panel.getByRole('button', {name: 'Kullanıcılar 1/1'}),
  ).toBeVisible();
  await expect(getPermission(page, ADMIN_PERMISSION_LABEL)).toBeChecked();
  await expect(getPermission(page, PEER_PERMISSION_LABEL)).toBeChecked();
});

for (const {name, direction, mover, rank} of [
  {name: 'up', direction: RoleDirection.UP, mover: 'lower', rank: 2},
  {name: 'down', direction: RoleDirection.DOWN, mover: 'upper', rank: 3},
]) {
  test(`moving a role ${name} swaps it with its neighbour, without a toast`, async ({
    page,
    backend,
    adminRole,
  }, testInfo) => {
    const upper = await backend.createRole({
      name: uniqueName(testInfo, 'upper'),
      anchorRoleId: adminRole.id,
    });
    const lower = await backend.createRole({
      name: uniqueName(testInfo, 'lower'),
      anchorRoleId: upper.id,
    });
    const moved = {upper, lower}[mover];
    await openRoles(page, {search: getTestKey(testInfo)});
    await expect(getTableRows(page)).toContainText([upper.label, lower.label]);

    await getRowButton(
      page,
      moved.label,
      RoleDirection.label(direction),
    ).click();

    await expect(getTableRows(page)).toContainText([lower.label, upper.label]);
    expect(await backend.findRole(moved.slug)).toMatchObject({rank});
    await expectToasts(page, []);
  });
}

test('a role granted to a user shows on the user’s row', async ({
  page,
  backend,
  adminRole,
}, testInfo) => {
  const [role, user] = await Promise.all([
    backend.createRole({
      name: uniqueName(testInfo, 'granted'),
      anchorRoleId: adminRole.id,
    }),
    backend.createUser({email: uniqueEmail(testInfo, 'grantee')}),
  ]);
  await gotoWithQuery(page, '/admin/users', {
    search: user.email,
    action: 'edit',
    id: user.id,
  });
  const panel = getDialog(page, 'Kullanıcı Düzenle');

  await panel.getByRole('combobox', {name: 'Roller'}).click();
  await page.getByRole('option', {name: role.label}).click();
  await page.keyboard.press('Escape');
  await getSaveButton(panel).click();

  await expectToasts(page, ['Kullanıcı güncellendi.']);
  await expect(getTableRow(page, user.email)).toContainText(role.label);
});

test('deleting a role asks first and reports once', async ({
  page,
  backend,
  adminRole,
}, testInfo) => {
  const role = await backend.createRole({
    name: uniqueName(testInfo, 'deleted'),
    anchorRoleId: adminRole.id,
  });
  await openRoles(page, {search: role.slug});

  await getRowButton(page, role.label, 'Sil').click();
  await confirmDangerous(page, `"${role.label}" rolü silinsin mi?`);

  await expectToasts(page, ['Rol silindi.']);
  await expect(getTableRow(page, role.label)).toHaveCount(0);
  expect(await backend.findRole(role.slug)).toBeNull();
});

test.describe('at a phone width', () => {
  test.use({viewport: PHONE_VIEWPORT});

  test('the edit drawer glides to its full height as its fields land', async ({
    page,
    backend,
    adminRole,
  }, testInfo) => {
    const role = await backend.createRole({
      name: uniqueName(testInfo, 'drawer'),
      permissions: [],
      anchorRoleId: adminRole.id,
    });
    await page.route(getApiUrl('/roles/*'), async route => {
      await new Promise(resolve => setTimeout(resolve, RECORD_LATENCY_MS));
      await route.continue();
    });
    await openRoles(page, {search: role.slug});
    await expect(getTableRow(page, role.label)).toBeVisible();
    await recordBoxes(page, DIALOG_SELECTOR);

    await clickRowMenuItem(page, role.label, 'Düzenle');

    const panel = getDialog(page, 'Rol Düzenle');
    await expect(
      panel.getByRole('button', {name: 'Üstüne', exact: true}),
    ).toBeVisible();
    await settleAnimations(panel);
    expectHeightsToGlide(await readBoxes(page, DIALOG_SELECTOR));
  });
});
