import {getApiUrl} from './api.js';
import {getTableRow} from './locators.js';

export async function clickRowMenuItem(page, cell, name) {
  await getTableRow(page, cell).getByRole('button', {name: 'İşlemler'}).click();
  await page.getByRole('menuitem', {name}).click();
}

export function getFilters(scope) {
  return scope.getByRole('search', {name: 'Tablo filtreleri'});
}

export function getSearchBox(scope, name) {
  return getFilters(scope).getByRole('searchbox', {name});
}

export function getFacet(scope, name) {
  return getFilters(scope).getByRole('combobox', {name});
}

export function getFilterReset(scope) {
  return getFilters(scope).getByRole('button', {name: 'Temizle', exact: true});
}

export function getNoRecords(scope) {
  return scope.getByRole('status').filter({hasText: 'Kayıt bulunamadı.'});
}

export function getBulkBar(page) {
  return page.getByRole('toolbar', {name: 'Toplu işlemler'});
}

export function getBulkButton(page, name) {
  return getBulkBar(page).getByRole('button', {name, exact: true});
}

export function getRowCheckbox(row) {
  return row.getByRole('checkbox', {name: 'Satırı seç'});
}

export async function selectRows(page, cells) {
  for (const cell of cells) {
    await getRowCheckbox(getTableRow(page, cell)).check();
  }
}

export function getColumnHeader(scope, name) {
  return scope.getByRole('columnheader', {name});
}

export async function openColumnMenu(header) {
  await header.getByRole('button').click();
}

export async function sortBy(header, direction) {
  await openColumnMenu(header);
  await header.page().getByRole('menuitemcheckbox', {name: direction}).click();
}

export function waitForListResponse(page, path, isMatch) {
  const url = getApiUrl(path);
  return page.waitForResponse(response => {
    const {origin, pathname, searchParams} = new URL(response.url());
    return `${origin}${pathname}` === url && isMatch(searchParams);
  });
}
