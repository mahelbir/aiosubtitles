export const OFFLINE_BANNER_TEXT =
  'Bağlantı yok. Çevrimiçi olunca güncellenecek.';

export const BUSY_SELECTOR = '[aria-busy="true"]';

export function getBusy(scope) {
  return scope.locator(BUSY_SELECTOR);
}

export function getLoadingStatus(scope) {
  return scope.getByRole('status', {name: 'Yükleniyor'});
}

export function getTopLoader(page) {
  return page.locator('.fetch-indicator');
}

export function getOfflineBanner(page) {
  return page.getByRole('status').filter({hasText: OFFLINE_BANNER_TEXT});
}

export function getOfflineNotice(scope) {
  return scope.getByText('Bağlantı yok. Çevrimiçi olunca yüklenecek.');
}

export function getDialog(page, name) {
  return page.getByRole('dialog', {name});
}

export function getTab(page, name) {
  return page.getByRole('tab', {name});
}

export function getTabPanel(page, name) {
  return page.getByRole('tabpanel', {name});
}

export function getCloseButton(dialog) {
  return dialog.getByRole('button', {name: 'Close', exact: true});
}

export function getSaveButton(scope) {
  return scope.getByRole('button', {name: 'Kaydet'});
}

export function getForm(page, name) {
  return page.getByRole('form', {name});
}

export function getField(scope, label) {
  return scope.getByLabel(label, {exact: true});
}

export function getFormField(page, form, label) {
  return getField(getForm(page, form), label);
}

export function getMonitorLevelSelect(page) {
  return page.getByRole('combobox', {
    name: 'Gösterilecek en düşük log seviyesi',
  });
}

export function getTableRows(scope) {
  return scope.getByRole('table').getByRole('rowgroup').last().getByRole('row');
}

export function getTableRow(page, cell) {
  return getTableRows(page).filter({
    has: page.getByRole('cell', {name: cell, exact: true}),
  });
}

export function getRowButton(page, cell, name) {
  return getTableRow(page, cell).getByRole('button', {name, exact: true});
}
