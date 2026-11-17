export const OFFLINE_BANNER_TEXT =
  'No connection. This will update when you are online.';

export const BUSY_SELECTOR = '[aria-busy="true"]';

export function getBusy(scope) {
  return scope.locator(BUSY_SELECTOR);
}

export function getLoadingStatus(scope) {
  return scope.getByRole('status', {name: 'Loading'});
}

export function getTopLoader(page) {
  return page.locator('.fetch-indicator');
}

export function getOfflineBanner(page) {
  return page.getByRole('status').filter({hasText: OFFLINE_BANNER_TEXT});
}

export function getOfflineNotice(scope) {
  return scope.getByText('No connection. This will load when you are online.');
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

export function getSaveButton(scope, name = 'Save') {
  return scope.getByRole('button', {name});
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
