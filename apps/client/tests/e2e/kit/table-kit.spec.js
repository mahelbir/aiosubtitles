import {range} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {toOffsetPagePayload} from '@repo/shared/lib/pagination.js';
import {DEFAULT_WINDOW_SIZE} from '../../../src/config/pagination.js';
import {
  getApiFailure,
  getApiUrl,
  getFailedRequestPattern,
  getSuccessEnvelope,
  respondInSequence,
  stubApi,
} from '../lib/api.js';
import {
  SETTLED_ERROR,
  expectFixtureState,
  openFixture,
  readDigest,
} from '../lib/fixture-page.js';
import {
  getBulkBar,
  getColumnHeader,
  getFacet,
  getFilterReset,
  getFilters,
  getRowCheckbox,
  getSearchBox,
  openColumnMenu,
  sortBy,
} from '../lib/list-screen.js';
import {
  getOfflineBanner,
  getOfflineNotice,
  getTableRows,
} from '../lib/locators.js';
import {
  API_DEPARTMENTS,
  DEPARTMENTS_FAILURE,
  DEPARTMENTS_FAILURE_PATTERN,
  OPTIONS_LOAD_FAILURE,
  getDepartmentsResponse,
  stubDepartments,
} from '../lib/option-lists.js';
import {
  PHONE_VIEWPORT,
  clickButton,
  expectSearchParams,
  settleAnimatedPositions,
  trackBoxDuring,
} from '../lib/page.js';
import {expect, test} from '../lib/test.js';
import {REFETCH_FAILURE_TOAST, expectToasts} from '../lib/toasts.js';

const LATENCY_MS = 800;
const OPTIONS_LATENCY_MS = 3000;
const SEARCH_DEBOUNCE_SETTLE_MS = 600;
const NARROW_VIEWPORT = {width: 640, height: 900};
const DOCUMENT_MARKER = '__isSameDocument';
const MAX_TAB_PRESSES = 10;
const API_PAGE_SIZE = 10;
const LOAD_FAILURE = 'Kullanıcılar yüklenemedi.';
const UNAVAILABLE_FAILURE = getApiFailure(
  StatusCodes.SERVICE_UNAVAILABLE,
  LOAD_FAILURE,
);
const FORBIDDEN_FAILURE = getApiFailure(StatusCodes.FORBIDDEN, LOAD_FAILURE);

function openTableKit(page, searchParams) {
  return openFixture(page, 'table-kit', searchParams);
}

async function openApiTableKit(page) {
  await openTableKit(page, {source: 'api'});
  await expect(getRangeStatus(page)).toHaveText('1-10 / 20');
}

function getUsersPagePath(pageNumber) {
  const search = new URLSearchParams({
    pageNumber,
    pageSize: API_PAGE_SIZE,
    windowSize: DEFAULT_WINDOW_SIZE,
  });
  return `/fixtures/users?${search}`;
}

function getUsersPageResponse(pageNumber) {
  const offset = (pageNumber - 1) * API_PAGE_SIZE;
  return {
    json: getSuccessEnvelope(
      toOffsetPagePayload({
        items: range(offset + 1, offset + API_PAGE_SIZE + 1).map(id => ({
          id,
          name: `Kullanıcı ${id}`,
          email: `kullanici${id}@ornek.com`,
          department: {id: 'destek', label: 'Destek'},
          disabledAt: null,
          createdAt: '2024-01-01T09:00:00.000Z',
          lastSeenAt: '2024-06-01T09:00:00.000Z',
        })),
        totalItemCount: 2 * API_PAGE_SIZE,
        pageNumber,
        pageSize: API_PAGE_SIZE,
        offset,
        windowSize: DEFAULT_WINDOW_SIZE,
      }),
    ),
  };
}

function stubUsersPage(
  page,
  pageNumber,
  respond = () => getUsersPageResponse(pageNumber),
) {
  const url = getApiUrl(getUsersPagePath(pageNumber));
  return stubApi(page, requestUrl => requestUrl.href === url, respond);
}

function stubUsersFailingAfterLoad(page, failure) {
  return stubUsersPage(
    page,
    1,
    respondInSequence(getUsersPageResponse(1), failure.response),
  );
}

function getUsersFailurePattern(pageNumber, failure) {
  return getFailedRequestPattern({
    [getUsersPagePath(pageNumber)]: [failure.status],
  });
}

function getUserTable(page) {
  return page.getByRole('region', {name: 'Kullanıcılar'});
}

function getBodyRows(page) {
  return getTableRows(getUserTable(page));
}

function getRow(page, name) {
  return getBodyRows(page).filter({hasText: name});
}

function getUserRowCheckbox(page, name) {
  return getRowCheckbox(getRow(page, name));
}

function getRangeStatus(page) {
  return getUserTable(page).getByRole('status').filter({hasText: ' / '});
}

function getTableBox(page) {
  return getUserTable(page)
    .locator('[aria-busy]')
    .filter({has: page.getByRole('table')});
}

function getPagination(page) {
  return getUserTable(page).getByRole('navigation', {name: 'Pagination'});
}

function getPageLink(page, name) {
  return getPagination(page).getByRole('link', {name, exact: true});
}

function getPageNumbers(page) {
  return getPagination(page).getByRole('link', {name: /^\d+$/});
}

function getUserFilters(page) {
  return getFilters(getUserTable(page));
}

function getUserSearchBox(page) {
  return getSearchBox(getUserTable(page), 'Kullanıcı ara');
}

function getFilterTrigger(page, title) {
  return getUserFilters(page).getByRole('button', {name: title}).first();
}

function getFacetTrigger(page, title) {
  return getFacet(getUserTable(page), title);
}

function getFacetList(page) {
  return page.getByRole('listbox');
}

function getFacetOptions(page) {
  return getFacetList(page).getByRole('option');
}

function getFacetOption(page, name) {
  return getFacetList(page).getByRole('option', {name, exact: true});
}

function getFacetSearch(page, title) {
  return page.getByPlaceholder(`${title}…`);
}

function readFacetOptionNames(page) {
  return getFacetOptions(page).allTextContents();
}

function getFilterClear(page, title) {
  return getUserFilters(page).getByTitle(`Clear ${title} filter`, {
    exact: true,
  });
}

function getResetButton(page) {
  return getFilterReset(getUserTable(page));
}

function getPopup(page) {
  return page.getByRole('dialog');
}

async function tabTo(page, target) {
  for (let press = 0; press < MAX_TAB_PRESSES; press += 1) {
    if (await target.evaluate(element => element === document.activeElement)) {
      break;
    }
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

async function fillDateRange(page, title, from, to) {
  await getFilterTrigger(page, title).click();
  await getPopup(page).getByLabel('Start').fill(from);
  await getPopup(page).getByLabel('End').fill(to);
}

function getUserColumnHeader(page, name) {
  return getColumnHeader(getUserTable(page), name);
}

function openUserColumnMenu(page, name) {
  return openColumnMenu(getUserColumnHeader(page, name));
}

function findElement(digest, predicate) {
  return digest.elements.find(predicate);
}

async function readRowColour(page, name) {
  return findElement(
    await readDigest(page),
    element => element.slot === 'table-row' && element.text?.includes(name),
  ).style.backgroundColor;
}

test.describe('table kit pagination', () => {
  test('page links carry the URL they lead to', async ({page}) => {
    await openTableKit(page, {search: 'Kaya'});

    await expect(getPageLink(page, '1')).toHaveAttribute(
      'href',
      '/fixtures/table-kit?search=Kaya',
    );
    await expect(getPageLink(page, '2')).toHaveAttribute(
      'href',
      '/fixtures/table-kit?search=Kaya&pageNumber=2',
    );
    await expect(getPageLink(page, 'Last page')).toHaveAttribute(
      'href',
      '/fixtures/table-kit?search=Kaya&pageNumber=2',
    );
  });

  test('a plain click on a page link changes the query without a full navigation', async ({
    page,
  }) => {
    await openTableKit(page);
    await page.evaluate(marker => {
      window[marker] = true;
    }, DOCUMENT_MARKER);

    await getPageLink(page, '3').click();

    await expectSearchParams(page).toEqual({pageNumber: '3'});
    await expect(getBodyRows(page).first()).toContainText('Gökhan Kaya');
    await expect(getRangeStatus(page)).toHaveText('21-30 / 96');
    await expect(getPageLink(page, '3')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await page.evaluate(marker => window[marker], DOCUMENT_MARKER)).toBe(
      true,
    );
  });

  test('a modified click leaves the page link to the browser', async ({
    page,
    context,
  }) => {
    await openTableKit(page);

    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      getPageLink(page, '3').click({modifiers: ['ControlOrMeta']}),
    ]);

    await expect(popup).toHaveURL(/\/fixtures\/table-kit\?pageNumber=3$/);
    await expectSearchParams(page).toEqual({});
    await expect(getRangeStatus(page)).toHaveText('1-10 / 96');
  });

  test('first and previous are disabled on the first page, next and last on the last', async ({
    page,
  }) => {
    await openTableKit(page);

    for (const label of ['First page', 'Previous page']) {
      await expect(getPageLink(page, label)).toBeDisabled();
      await expect(getPageLink(page, label)).not.toHaveAttribute('href');
    }
    for (const label of ['Next page', 'Last page']) {
      await expect(getPageLink(page, label)).toBeEnabled();
      await expect(getPageLink(page, label)).not.toHaveAttribute(
        'aria-disabled',
      );
    }

    await getPageLink(page, 'Last page').click();

    await expectSearchParams(page).toEqual({pageNumber: '10'});
    for (const label of ['Next page', 'Last page']) {
      await expect(getPageLink(page, label)).toBeDisabled();
      await expect(getPageLink(page, label)).not.toHaveAttribute('href');
    }
    for (const label of ['First page', 'Previous page']) {
      await expect(getPageLink(page, label)).toHaveAttribute(
        'href',
        /\/fixtures\/table-kit(\?pageNumber=9)?$/,
      );
    }
  });

  test('the window of page numbers follows the current page at the configured width', async ({
    page,
  }) => {
    await openTableKit(page);

    await expect(getPageNumbers(page)).toHaveText(['1', '2', '3', '4', '5']);

    await getPageLink(page, '5').click();

    await expect(getPageNumbers(page)).toHaveText(['3', '4', '5', '6', '7']);

    await getPageLink(page, 'Last page').click();

    await expect(getPageNumbers(page)).toHaveText(['6', '7', '8', '9', '10']);
    await expect(getPageNumbers(page)).toHaveCount(DEFAULT_WINDOW_SIZE);
    await expectFixtureState(page).toMatchObject({
      list: {windowSize: DEFAULT_WINDOW_SIZE},
    });
  });

  test('changing the page size writes it to the URL and returns to the first page', async ({
    page,
  }) => {
    await openTableKit(page, {pageNumber: 3});
    const pageSize = getUserTable(page).getByRole('combobox', {
      name: 'Rows per page',
    });

    await pageSize.click();
    await page.getByRole('option', {name: '25', exact: true}).click();

    await expectSearchParams(page).toEqual({pageSize: '25'});
    await expect(getRangeStatus(page)).toHaveText('1-25 / 96');
    await expect(getBodyRows(page)).toHaveCount(25);

    await pageSize.click();
    await page.getByRole('option', {name: '10', exact: true}).click();

    await expectSearchParams(page).toEqual({});
    await expect(getRangeStatus(page)).toHaveText('1-10 / 96');
  });

  test('a single page renders no page navigation, only the size and the range', async ({
    page,
  }) => {
    await openTableKit(page, {total: 8});

    await expect(getRangeStatus(page)).toHaveText('1-8 / 8');
    await expect(
      getUserTable(page).getByRole('combobox', {name: 'Rows per page'}),
    ).toBeVisible();
    await expect(getPagination(page)).toHaveCount(0);
  });

  test('the pagination is a named navigation landmark holding a list of links', async ({
    page,
  }) => {
    await openTableKit(page);

    await expect(getPagination(page)).toMatchAriaSnapshot(`
      - navigation "Pagination":
        - list:
          - listitem:
            - link "First page" [disabled]
          - listitem:
            - link "Previous page" [disabled]
          - listitem:
            - link "1"
          - listitem:
            - link "2"
          - listitem:
            - link "3"
          - listitem:
            - link "4"
          - listitem:
            - link "5"
          - listitem:
            - link "Next page"
          - listitem:
            - link "Last page"
    `);
  });

  test.describe('at a phone width', () => {
    test.use({viewport: PHONE_VIEWPORT});

    test('previous and next are hidden while first, last and the page numbers stay', async ({
      page,
    }) => {
      await openTableKit(page, {pageNumber: 5});
      const pagination = getPagination(page);

      await expect(pagination.getByLabel('Previous page')).toBeHidden();
      await expect(pagination.getByLabel('Next page')).toBeHidden();
      await expect(getPageLink(page, 'First page')).toBeVisible();
      await expect(getPageLink(page, 'Last page')).toBeVisible();
      await expect(getPageNumbers(page)).toHaveText(['3', '4', '5', '6', '7']);
    });
  });
});

test.describe('table kit toolbar', () => {
  test('the filter row is a named search landmark, not a toolbar', async ({
    page,
  }) => {
    await openTableKit(page);

    await expect(getUserFilters(page)).toBeVisible();
    await expect(getUserSearchBox(page)).toBeVisible();
    await expect(page.getByRole('toolbar')).toHaveCount(0);
  });

  test('a typed search reaches the URL after the debounce and returns to the first page', async ({
    page,
  }) => {
    await openTableKit(page, {pageNumber: 3});

    await getUserSearchBox(page).pressSequentially('Çağla');

    await expectSearchParams(page).toEqual({search: 'Çağla'});
    await expect(getRangeStatus(page)).toHaveText('1-8 / 8');
    await expect(getBodyRows(page)).toHaveCount(8);
    for (const row of await getBodyRows(page).all()) {
      await expect(row).toContainText('Çağla');
    }
  });

  test('a search shorter than the minimum length stays out of the URL', async ({
    page,
  }) => {
    await openTableKit(page);
    const search = getUserSearchBox(page);

    await search.pressSequentially('Ç');
    await page.waitForTimeout(SEARCH_DEBOUNCE_SETTLE_MS);

    await expect(search).toHaveValue('Ç');
    await expectSearchParams(page).toEqual({});
    await expectFixtureState(page).toMatchObject({list: {search: ''}});
    await expect(getRangeStatus(page)).toHaveText('1-10 / 96');
  });

  test('the faceted filter writes a multi-value param and joins a second value with a comma', async ({
    page,
  }) => {
    await openTableKit(page, {pageNumber: 2});

    await getFacetTrigger(page, 'Durum').click();
    await getFacetOption(page, 'Pasif').click();

    await expectSearchParams(page).toEqual({disabled: 'true'});
    await expect(getRangeStatus(page)).toHaveText('1-10 / 24');

    await getFacetOption(page, 'Aktif').click();

    await expectSearchParams(page).toEqual({disabled: 'true,false'});
    await expectFixtureState(page).toMatchObject({
      list: {disabled: [true, false]},
    });
    await expect(getRangeStatus(page)).toHaveText('1-10 / 96');
    await page.keyboard.press('Escape');
    await expect(getFacetTrigger(page, 'Durum')).toContainText('Pasif');
    await expect(getFacetTrigger(page, 'Durum')).toContainText('Aktif');
    await expect(getFacetTrigger(page, 'Durum')).toHaveAccessibleName(
      'Durum, 2 selected',
    );
  });

  test('a single-value faceted filter searches its long option list and replaces its value', async ({
    page,
  }) => {
    await openTableKit(page);

    await getFacetTrigger(page, 'Departman').click();
    await getFacetSearch(page, 'Departman').pressSequentially('huk');

    await expect(getFacetOptions(page)).toHaveText(['Hukuk']);

    await getFacetOption(page, 'Hukuk').click();

    await expectSearchParams(page).toEqual({department: 'hukuk'});
    await expect(getRangeStatus(page)).toHaveText('1-8 / 8');

    await getFacetTrigger(page, 'Departman').click();
    await getFacetOption(page, 'Satış').click();

    await expectSearchParams(page).toEqual({department: 'satis'});
    await expectFixtureState(page).toMatchObject({
      list: {department: ['satis']},
    });
  });

  test('a filter carrying its own parser keeps a deep-linked value while its options load', async ({
    page,
  }) => {
    await openTableKit(page, {department: 'hukuk', delay: OPTIONS_LATENCY_MS});

    await expectFixtureState(page).toMatchObject({
      list: {department: ['hukuk']},
    });
    await expect(getFacetTrigger(page, 'Departman')).not.toContainText('Hukuk');

    await expect(getFacetTrigger(page, 'Departman')).toContainText('Hukuk', {
      timeout: OPTIONS_LATENCY_MS * 2,
    });
    await expectSearchParams(page).toEqual({
      department: 'hukuk',
      delay: String(OPTIONS_LATENCY_MS),
    });
    await expect(getRangeStatus(page)).toHaveText('1-8 / 8');
  });

  test('the date range filter registers its own params and writes both bounds', async ({
    page,
  }) => {
    await openTableKit(page);

    await fillDateRange(page, 'Kayıt tarihi', '2024-02-01', '2024-02-10');

    await expectSearchParams(page).toEqual({
      createdFrom: '2024-02-01',
      createdTo: '2024-02-10',
    });
    await expectFixtureState(page).toMatchObject({
      list: {createdFrom: '2024-02-01', createdTo: '2024-02-10'},
    });
    await expect(getRangeStatus(page)).toHaveText('1-10 / 10');
    await expect(getFilterTrigger(page, 'Kayıt tarihi')).toContainText(
      'Feb 1 – 10, 2024',
    );
  });

  test('a deep-linked date range hydrates cleanly', async ({page}) => {
    await openTableKit(page, {
      createdFrom: '2024-01-01',
      createdTo: '2024-03-31',
    });

    await expect(getFilterTrigger(page, 'Kayıt tarihi')).toContainText(
      'Mar 31, 2024',
    );
    await expect(getRangeStatus(page)).toHaveText('1-10 / 91');
  });

  test.describe('in a fixed time zone', () => {
    test.use({timezoneId: 'Europe/Istanbul'});

    test('the day range filter writes the local day bounds as instants and reads them back', async ({
      page,
    }) => {
      await openTableKit(page);

      await fillDateRange(page, 'Son giriş', '2024-06-03', '2024-06-03');

      await expectSearchParams(page).toEqual({
        seenFrom: '2024-06-02T21:00:00.000Z',
        seenTo: '2024-06-03T20:59:59.999Z',
      });
      await expect(getRangeStatus(page)).toHaveText('1-2 / 2');

      await page.reload();
      await getFilterTrigger(page, 'Son giriş').click();

      await expect(getPopup(page).getByLabel('Start')).toHaveValue(
        '2024-06-03',
      );
      await expect(getPopup(page).getByLabel('End')).toHaveValue('2024-06-03');
    });
  });

  test('a filter’s clear shortcut removes only its params on a click, without opening it', async ({
    page,
  }) => {
    await openTableKit(page, {search: 'Ada', disabled: 'false'});
    await fillDateRange(page, 'Kayıt tarihi', '2024-01-01', '2024-03-31');
    await page.keyboard.press('Escape');
    await expect(getPopup(page)).toHaveCount(0);

    await getFilterClear(page, 'Durum').click();

    await expectSearchParams(page).toEqual({
      search: 'Ada',
      createdFrom: '2024-01-01',
      createdTo: '2024-03-31',
    });
    await expect(getFacetList(page)).toHaveCount(0);

    await getFilterClear(page, 'Kayıt tarihi').click();

    await expectSearchParams(page).toEqual({search: 'Ada'});
    await expect(getPopup(page)).toHaveCount(0);
  });

  test('the clear shortcut stays out of the keyboard and the accessibility tree, which clear through the popover', async ({
    page,
  }) => {
    await openTableKit(page, {
      disabled: 'false',
      createdFrom: '2024-01-01',
      createdTo: '2024-03-31',
    });

    for (const title of ['Durum', 'Kayıt tarihi']) {
      const clear = getFilterClear(page, title);
      await expect(clear).toHaveAttribute('aria-hidden', 'true');
      await expect(clear).not.toHaveAttribute('tabindex');
      await clear.focus();
      await expect(clear).not.toBeFocused();
    }
    await expect(
      getUserFilters(page).getByRole('button', {name: /^Clear .* filter$/}),
    ).toHaveCount(0);

    await getFacetTrigger(page, 'Durum').focus();
    await page.keyboard.press('Enter');
    await expect(getFacetList(page)).toBeVisible();
    await page.keyboard.press('End');
    await expect(getFacetOption(page, 'Clear filter')).toBeFocused();
    await page.keyboard.press('Enter');

    await expectSearchParams(page).toEqual({
      createdFrom: '2024-01-01',
      createdTo: '2024-03-31',
    });
    await expect(getFacetList(page)).toHaveCount(0);
    await expect(getFacetTrigger(page, 'Durum')).toBeFocused();

    await getFilterTrigger(page, 'Kayıt tarihi').focus();
    await page.keyboard.press('Enter');
    await expect(getPopup(page).getByLabel('Start')).toBeFocused();
    await tabTo(page, getPopup(page).getByRole('button', {name: 'Clear'}));
    await page.keyboard.press('Enter');

    await expectSearchParams(page).toEqual({});
  });

  test('the toolbar’s clear button removes the search and every filter, keeping sort and page size', async ({
    page,
  }) => {
    await openTableKit(page, {
      search: 'Ada',
      disabled: 'false',
      department: 'yonetim',
      createdFrom: '2024-01-01',
      sort: '-id',
      pageSize: 25,
    });
    const search = getUserSearchBox(page);
    await expect(search).toHaveValue('Ada');

    await getResetButton(page).click();

    await expectSearchParams(page).toEqual({sort: '-id', pageSize: '25'});
    await expect(search).toHaveValue('');
    await expect(getResetButton(page)).toHaveCount(0);
    await expect(getRangeStatus(page)).toHaveText('1-25 / 96');
  });

  test('hand-edited junk is dropped and the table renders the defaults', async ({
    page,
  }) => {
    await openTableKit(page, {
      pageSize: 999,
      sort: 'nope',
      pageNumber: 'abc',
      disabled: 'maybe',
    });

    await expectFixtureState(page).toMatchObject({
      list: {pageNumber: 1, pageSize: 10, sort: [], search: ''},
      status: 'success',
    });
    await expect(getRangeStatus(page)).toHaveText('1-10 / 96');
    await expect(getUserTable(page).getByRole('alert')).toHaveCount(0);
  });

  for (const pageNumber of ['-1', '0', '2.5']) {
    test(`a page number outside the allowed range (${pageNumber}) is dropped`, async ({
      page,
    }) => {
      await openTableKit(page, {pageNumber});

      await expectFixtureState(page).toMatchObject({
        list: {pageNumber: 1},
        status: 'success',
      });
      await expect(getRangeStatus(page)).toHaveText('1-10 / 96');
      await expect(getUserTable(page).getByRole('alert')).toHaveCount(0);
    });
  }

  test('a column header sorts the list, writes the sort and reflects it in aria-sort', async ({
    page,
  }) => {
    await openTableKit(page, {pageNumber: 2});
    const header = getUserColumnHeader(page, 'Ad');
    await expect(header).not.toHaveAttribute('aria-sort');

    await openUserColumnMenu(page, 'Ad');
    await page.getByRole('menuitemcheckbox', {name: 'Ascending'}).click();

    await expectSearchParams(page).toEqual({sort: 'name'});
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    await expect(getBodyRows(page).first()).toContainText('Ada Arslan');

    await openUserColumnMenu(page, 'Ad');
    await page.getByRole('menuitemcheckbox', {name: 'Descending'}).click();

    await expectSearchParams(page).toEqual({sort: '-name'});
    await expect(header).toHaveAttribute('aria-sort', 'descending');
    await expect(getBodyRows(page).first()).toContainText('Jale Yılmaz');

    await openUserColumnMenu(page, 'Ad');
    await page.getByRole('menuitem', {name: 'Clear sort'}).click();

    await expectSearchParams(page).toEqual({});
    await expect(header).not.toHaveAttribute('aria-sort');
    await expect(getBodyRows(page).first()).toContainText('Ada Yılmaz');
  });

  test('a second column appends to the sort and shows its position', async ({
    page,
  }) => {
    await openTableKit(page, {sort: 'name'});

    await openUserColumnMenu(page, 'No');
    await page.getByRole('menuitem', {name: 'Add as descending'}).click();

    await expectSearchParams(page).toEqual({sort: 'name,-id'});
    await expect(getUserColumnHeader(page, 'No')).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    await expect(
      getUserColumnHeader(page, 'Ad').getByRole('button'),
    ).toContainText('1');
    await expect(
      getUserColumnHeader(page, 'No').getByRole('button'),
    ).toContainText('2');

    await openUserColumnMenu(page, 'Ad');
    await page.getByRole('menuitem', {name: 'Remove from sort'}).click();

    await expectSearchParams(page).toEqual({sort: '-id'});
    await expect(getBodyRows(page).first()).toContainText('Jale Arslan');
  });

  test('the column menu opens from the keyboard and sorts with Enter', async ({
    page,
  }) => {
    await openTableKit(page);
    await getUserColumnHeader(page, 'Kayıt tarihi').getByRole('button').focus();

    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('menuitemcheckbox', {name: 'Ascending'}),
    ).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expectSearchParams(page).toEqual({sort: '-createdAt'});
    await expect(getBodyRows(page).first()).toContainText('Jale Arslan');
  });

  test('a column hidden from its header stays hidden after a reload until shown again', async ({
    page,
  }) => {
    await openTableKit(page);

    await openUserColumnMenu(page, 'E-posta');
    await page.getByRole('menuitem', {name: 'Hide column'}).click();

    await expect(getUserColumnHeader(page, 'E-posta')).toHaveCount(0);

    await page.reload();

    await expect(getUserColumnHeader(page, 'Ad')).toBeVisible();
    await expect(getUserColumnHeader(page, 'E-posta')).toHaveCount(0);

    await openUserColumnMenu(page, 'Ad');
    await page.getByRole('menuitem', {name: 'Show hidden columns (1)'}).click();

    await expect(getUserColumnHeader(page, 'E-posta')).toBeVisible();
  });
});

test.describe('table kit faceted filter', () => {
  test('a filter with ten or fewer options lists them without a search box', async ({
    page,
  }) => {
    await openTableKit(page);

    await getFacetTrigger(page, 'Durum').click();

    await expect(getFacetOptions(page)).toHaveText(['Aktif', 'Pasif']);
    await expect(getFacetSearch(page, 'Durum')).toHaveCount(0);
  });

  test('a filter past ten options searches inside its popup', async ({
    page,
  }) => {
    await openTableKit(page);

    await getFacetTrigger(page, 'Departman').click();

    await expect(getFacetSearch(page, 'Departman')).toBeFocused();
    await expect(getFacetOptions(page)).toHaveCount(12);

    await getFacetSearch(page, 'Departman').pressSequentially('sat');

    await expect(getFacetOptions(page)).toHaveText(['Satış', 'Satın Alma']);
  });

  test('selected options sit at the top while the search is empty', async ({
    page,
  }) => {
    await openTableKit(page, {owner: '25,13'});

    await getFacetTrigger(page, 'Sahip').click();

    await expect
      .poll(async () => (await readFacetOptionNames(page)).slice(0, 3))
      .toEqual(['Ada Demir', 'Ada Kaya', 'Ada Yılmaz']);

    await getFacetSearch(page, 'Sahip').pressSequentially('Ada');

    await expect(getFacetOptions(page)).toHaveText([
      'Ada Yılmaz',
      'Ada Kaya',
      'Ada Demir',
    ]);
  });

  test('a local list and a plain list also open with their selected options first', async ({
    page,
  }) => {
    await openTableKit(page, {department: 'uretim', disabled: 'true'});

    await getFacetTrigger(page, 'Departman').click();
    await expect(getFacetOptions(page).first()).toHaveText('Üretim');
    await page.keyboard.press('Escape');
    await expect(getFacetList(page)).toHaveCount(0);

    await getFacetTrigger(page, 'Durum').click();
    await expect(getFacetOptions(page)).toHaveText([
      'Pasif',
      'Aktif',
      'Clear filter',
    ]);
  });

  test('a filter stops at twenty values by default', async ({page}) => {
    const deepLinked = range(12, 31);
    await openTableKit(page, {owner: deepLinked.join(',')});
    await getFacetTrigger(page, 'Sahip').click();
    await expect(getFacetOption(page, 'Ada Yılmaz')).toBeVisible();
    await expect(
      getFacetList(page).getByRole('option', {disabled: true}),
    ).toHaveCount(0);

    await getFacetOption(page, 'Ada Yılmaz').click();

    await expectFixtureState(page).toMatchObject({
      list: {owner: [...deepLinked, 1]},
    });
    await expect(page.getByText('You can select up to 20.')).toBeVisible();
    await expect(getFacetOption(page, 'Barış Yılmaz')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(
      getFacetList(page).getByRole('option', {disabled: true}),
    ).toHaveCount(10);
    await expect(getFacetOption(page, 'Ada Yılmaz')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('a deep-linked remote filter shows its labels before the popup opens', async ({
    page,
  }) => {
    await openTableKit(page, {owner: 3});

    await expect(getFacetTrigger(page, 'Sahip')).toContainText('Cem Yılmaz');
    await expect(getFacetList(page)).toHaveCount(0);
  });

  test('a single-value filter closes on choice', async ({page}) => {
    await openTableKit(page);

    await getFacetTrigger(page, 'Departman').click();
    await getFacetOption(page, 'Hukuk').click();

    await expect(getFacetList(page)).toHaveCount(0);
    await expectSearchParams(page).toEqual({department: 'hukuk'});
    await expect(getFacetTrigger(page, 'Departman')).toContainText('Hukuk');
  });
});

test.describe('table kit selection', () => {
  test('selecting rows shows the action bar as a toolbar announcing the count', async ({
    page,
  }) => {
    await openTableKit(page);

    await getUserRowCheckbox(page, 'Ada Yılmaz').click();
    await getUserRowCheckbox(page, 'Barış Yılmaz').click();

    await expect(getBulkBar(page)).toBeVisible();
    await expect(getBulkBar(page).getByRole('status')).toHaveText('2 selected');
  });

  test('the action bar fades out where it stood once the selection clears', async ({
    page,
  }) => {
    await openTableKit(page);
    await getUserRowCheckbox(page, 'Ada Yılmaz').click();
    await expect(getBulkBar(page)).toBeVisible();
    await settleAnimatedPositions(page);

    const boxes = await trackBoxDuring(getBulkBar(page), () =>
      getBulkBar(page).getByRole('button', {name: 'Clear selection'}).click(),
    );

    expect(boxes).toHaveLength(1);
    await expect(getBulkBar(page)).toHaveCount(0);
  });

  test('arrow keys move between the action bar’s buttons', async ({page}) => {
    await openTableKit(page);
    await getUserRowCheckbox(page, 'Ada Yılmaz').click();
    const clear = getBulkBar(page).getByRole('button', {
      name: 'Clear selection',
    });
    const bulk = getBulkBar(page).getByRole('button', {name: 'Pasifleştir'});

    await clear.focus();
    await page.keyboard.press('ArrowRight');

    await expect(bulk).toBeFocused();

    await page.keyboard.press('ArrowLeft');

    await expect(clear).toBeFocused();
  });

  test('the bulk action receives the selected ids and the clear control empties the selection', async ({
    page,
  }) => {
    await openTableKit(page);
    await getUserRowCheckbox(page, 'Ada Yılmaz').click();
    await getUserRowCheckbox(page, 'Cem Yılmaz').click();

    await getBulkBar(page).getByRole('button', {name: 'Pasifleştir'}).click();

    await expectFixtureState(page).toMatchObject({bulkIds: [1, 3]});

    await getBulkBar(page)
      .getByRole('button', {name: 'Clear selection'})
      .click();

    await expect(getBulkBar(page)).toHaveCount(0);
    await expect(getUserRowCheckbox(page, 'Ada Yılmaz')).not.toBeChecked();
    await expect(getUserRowCheckbox(page, 'Cem Yılmaz')).not.toBeChecked();
  });

  test('the header checkbox is mixed with a partial selection and toggles the whole page', async ({
    page,
  }) => {
    await openTableKit(page);
    const selectAll = getUserTable(page).getByRole('checkbox', {
      name: 'Select all',
    });

    await getUserRowCheckbox(page, 'Ada Yılmaz').click();

    await expect(selectAll).toBeChecked({indeterminate: true});

    await selectAll.click();

    await expect(selectAll).toBeChecked();
    await expect(getBulkBar(page).getByRole('status')).toHaveText(
      '10 selected',
    );

    await selectAll.click();

    await expect(selectAll).not.toBeChecked();
    await expect(getBulkBar(page)).toHaveCount(0);
  });

  test('the selection survives a refetch and a mutate under the same query key', async ({
    page,
  }) => {
    await openTableKit(page, {delay: LATENCY_MS});
    await expect(getRangeStatus(page)).toHaveText('1-10 / 96');
    await getUserRowCheckbox(page, 'Ada Yılmaz').click();
    await getUserRowCheckbox(page, 'Barış Yılmaz').click();

    await page.getByRole('button', {name: 'Yenile'}).click();

    await expect(getTableBox(page)).toHaveAttribute('aria-busy', 'true');
    await expect(getTableBox(page)).toHaveAttribute('aria-busy', 'false');
    await expect(getUserRowCheckbox(page, 'Ada Yılmaz')).toBeChecked();

    await page.getByRole('button', {name: 'İlk kullanıcıyı değiştir'}).click();

    await expect(getRow(page, 'Ada Yılmaz')).toContainText('Pasif');
    await expect(getUserRowCheckbox(page, 'Ada Yılmaz')).toBeChecked();
    await expect(getUserRowCheckbox(page, 'Barış Yılmaz')).toBeChecked();
    await expect(getBulkBar(page).getByRole('status')).toHaveText('2 selected');
  });

  test('the selection collapses once the list query changes', async ({
    page,
  }) => {
    await openTableKit(page);
    await getUserRowCheckbox(page, 'Ada Yılmaz').click();

    await getUserSearchBox(page).pressSequentially('Ada');
    await expect(getRangeStatus(page)).toHaveText('1-8 / 8');

    await expect(getUserRowCheckbox(page, 'Ada Yılmaz')).not.toBeChecked();
    await expect(getBulkBar(page)).toHaveCount(0);

    await getUserRowCheckbox(page, 'Ada Yılmaz').click();
    await getResetButton(page).click();
    await expect(getRangeStatus(page)).toHaveText('1-10 / 96');
    await getUserRowCheckbox(page, 'Ada Yılmaz').click();
    await getPageLink(page, '2').click();
    await expect(getRangeStatus(page)).toHaveText('11-20 / 96');

    await expect(getBulkBar(page)).toHaveCount(0);

    await getPageLink(page, '1').click();
    await expect(getRangeStatus(page)).toHaveText('1-10 / 96');

    await expect(getUserRowCheckbox(page, 'Ada Yılmaz')).not.toBeChecked();
    await expect(getBulkBar(page)).toHaveCount(0);
  });

  test.describe('with a caller’s selectability rule', () => {
    test('an unselectable row renders a disabled checkbox and select-all skips it', async ({
      page,
    }) => {
      await openTableKit(page, {selectable: 'active'});
      const selectAll = getUserTable(page).getByRole('checkbox', {
        name: 'Select all',
      });

      await expect(getUserRowCheckbox(page, 'Çağla Yılmaz')).toBeDisabled();
      await expect(getUserRowCheckbox(page, 'Fatma Yılmaz')).toBeDisabled();
      await expect(getUserRowCheckbox(page, 'Ada Yılmaz')).toBeEnabled();

      await getUserRowCheckbox(page, 'Çağla Yılmaz').click({force: true});

      await expect(getBulkBar(page)).toHaveCount(0);

      await selectAll.click();

      await expect(selectAll).toBeChecked();
      await expect(getBulkBar(page).getByRole('status')).toHaveText(
        '8 selected',
      );
      await expect(getUserRowCheckbox(page, 'Çağla Yılmaz')).not.toBeChecked();

      await getBulkBar(page).getByRole('button', {name: 'Pasifleştir'}).click();

      await expectFixtureState(page).toMatchObject({
        bulkIds: [1, 2, 3, 5, 6, 7, 9, 10],
      });
    });

    test('the header checkbox is disabled when no row on the page is selectable', async ({
      page,
    }) => {
      await openTableKit(page, {selectable: 'active', disabled: 'true'});

      await expect(getRangeStatus(page)).toHaveText('1-10 / 24');
      await expect(
        getUserTable(page).getByRole('checkbox', {name: 'Select all'}),
      ).toBeDisabled();
    });
  });
});

test.describe('table kit expanding', () => {
  test('the expander opens a detail row and reports its state', async ({
    page,
  }) => {
    await openTableKit(page);
    const expander = getRow(page, 'Ada Yılmaz').getByRole('button', {
      name: 'Row details',
    });
    const detail = getUserTable(page).getByRole('group', {
      name: 'Ada Yılmaz ayrıntıları',
    });

    await expect(expander).toHaveAttribute('aria-expanded', 'false');

    await expander.click();

    await expect(expander).toHaveAttribute('aria-expanded', 'true');
    await expect(detail).toContainText('ada.yilmaz@ornek.com');
    await expect(detail).toContainText('Yönetim');

    await expander.click();

    await expect(expander).toHaveAttribute('aria-expanded', 'false');
    await expect(detail).toHaveCount(0);
  });

  test('the detail row fades in as it opens', async ({page}) => {
    await openTableKit(page);
    await page.evaluate(() => {
      window.__fadedTexts = [];
      document.addEventListener('transitionrun', event => {
        if (event.propertyName === 'opacity') {
          window.__fadedTexts.push(event.target.textContent);
        }
      });
    });

    await getRow(page, 'Ada Yılmaz')
      .getByRole('button', {name: 'Row details'})
      .click();

    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__fadedTexts.some(text =>
            text.includes('ada.yilmaz@ornek.com'),
          ),
        ),
      )
      .toBe(true);
  });

  test('an expanded row survives a refetch and a mutate, and collapses once the query changes', async ({
    page,
  }) => {
    await openTableKit(page, {delay: LATENCY_MS});
    await expect(getRangeStatus(page)).toHaveText('1-10 / 96');
    const detail = getUserTable(page).getByRole('group', {
      name: 'Ada Yılmaz ayrıntıları',
    });
    await getRow(page, 'Ada Yılmaz')
      .getByRole('button', {name: 'Row details'})
      .click();

    await page.getByRole('button', {name: 'Yenile'}).click();

    await expect(getTableBox(page)).toHaveAttribute('aria-busy', 'true');
    await expect(getTableBox(page)).toHaveAttribute('aria-busy', 'false');
    await expect(detail).toBeVisible();

    await page.getByRole('button', {name: 'İlk kullanıcıyı değiştir'}).click();

    await expect(getRow(page, 'Ada Yılmaz')).toContainText('Pasif');
    await expect(detail).toBeVisible();

    await getPageLink(page, '2').click();
    await expect(getRangeStatus(page)).toHaveText('11-20 / 96');
    await getPageLink(page, '1').click();
    await expect(getRangeStatus(page)).toHaveText('1-10 / 96');

    await expect(detail).toHaveCount(0);
    await expect(
      getRow(page, 'Ada Yılmaz').getByRole('button', {name: 'Row details'}),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  test('an expanded row collapses once the search changes', async ({page}) => {
    await openTableKit(page);
    const expander = getRow(page, 'Ada Yılmaz').getByRole('button', {
      name: 'Row details',
    });
    await expander.click();
    await expect(expander).toHaveAttribute('aria-expanded', 'true');

    await getUserSearchBox(page).pressSequentially('Ada');

    await expectSearchParams(page).toEqual({search: 'Ada'});
    await expect(getRangeStatus(page)).toHaveText('1-8 / 8');
    await expect(expander).toHaveAttribute('aria-expanded', 'false');
    await expect(
      getUserTable(page).getByRole('group', {name: 'Ada Yılmaz ayrıntıları'}),
    ).toHaveCount(0);
  });

  test.describe('in a table wider than its container', () => {
    test.use({viewport: NARROW_VIEWPORT});

    test('the detail panel is pinned to the scroll container’s visible width', async ({
      page,
    }) => {
      await openTableKit(page);
      await getRow(page, 'Ada Yılmaz')
        .getByRole('button', {name: 'Row details'})
        .click();
      await expect(
        getUserTable(page).getByRole('group', {name: 'Ada Yılmaz ayrıntıları'}),
      ).toBeVisible();

      const isDetail = element => element.label === 'Ada Yılmaz ayrıntıları';
      const isEmailHeader = element =>
        element.slot === 'table-head' && element.text === 'E-posta';
      const before = await readDigest(page);
      const container = findElement(
        before,
        element => element.slot === 'table-container',
      );
      const table = findElement(before, element => element.slot === 'table');
      const detail = findElement(before, isDetail);

      expect(table.box.w).toBeGreaterThan(container.box.w);
      expect(detail.box.x).toBeGreaterThanOrEqual(container.box.x);
      expect(detail.box.x + detail.box.w).toBeLessThanOrEqual(
        container.box.x + container.box.w,
      );

      await getUserTable(page).getByRole('table').hover();
      await page.mouse.wheel(300, 0);

      await expect
        .poll(
          async () => findElement(await readDigest(page), isEmailHeader).box.x,
        )
        .toBeLessThan(findElement(before, isEmailHeader).box.x);
      expect(findElement(await readDigest(page), isDetail).box).toEqual(
        detail.box,
      );
    });

    test('the scroll container stops at its edges instead of bouncing past them', async ({
      page,
    }) => {
      await openTableKit(page);

      await expect(
        getUserTable(page).getByRole('table').locator('..'),
      ).toHaveCSS('overscroll-behavior-x', 'none');
    });
  });
});

test.describe('table kit states', () => {
  test('an empty list renders the empty state without an action', async ({
    page,
  }) => {
    await openTableKit(page, {total: 0});

    await expect(getUserTable(page).getByRole('status')).toHaveText(
      'No records found.',
    );
    await expect(
      getUserTable(page).getByRole('button', {name: 'Kullanıcı ekle'}),
    ).toHaveCount(0);
    await expect(getRangeStatus(page)).toHaveCount(0);
    await expect(getPagination(page)).toHaveCount(0);
  });

  test('an empty list renders the caller’s action', async ({page}) => {
    await openTableKit(page, {total: 0, action: 1});

    await expect(
      getUserTable(page).getByText('No records found.'),
    ).toBeVisible();

    await getUserTable(page)
      .getByRole('button', {name: 'Kullanıcı ekle'})
      .click();

    await expectFixtureState(page).toMatchObject({emptyActionCount: 1});
  });

  test('a search without matches renders the empty state', async ({page}) => {
    await openTableKit(page, {search: 'zzz'});

    await expect(
      getUserTable(page).getByText('No records found.'),
    ).toBeVisible();
    await expect(getBodyRows(page)).toHaveCount(0);
  });

  test('?state=offline mounts the list with the network reported offline and shows the offline notice', async ({
    page,
  }) => {
    await openTableKit(page, {state: 'offline'});

    await expect(getOfflineNotice(getUserTable(page))).toBeVisible();
    await expectFixtureState(page).toMatchObject({
      status: 'pending',
      fetchStatus: 'paused',
    });
    await expect(getBodyRows(page)).toHaveCount(0);
  });

  test('a list mounted while offline shows the offline notice and loads once back online', async ({
    page,
    context,
  }) => {
    await openTableKit(page);
    await expect(getRangeStatus(page)).toHaveText('1-10 / 96');

    await context.setOffline(true);
    await expect(getOfflineBanner(page)).toBeVisible();
    await page.evaluate(() => window.history.pushState(null, '', '?total=40'));

    await expect(getOfflineNotice(getUserTable(page))).toBeVisible();
    await expect(getBodyRows(page)).toHaveCount(0);
    await expectFixtureState(page).toMatchObject({
      status: 'pending',
      fetchStatus: 'paused',
    });

    await context.setOffline(false);

    await expect(getRangeStatus(page)).toHaveText('1-10 / 40');
    await expect(getOfflineNotice(getUserTable(page))).toHaveCount(0);
  });

  test('a slow first load shows the pending skeleton, then the rows', async ({
    page,
  }) => {
    await openTableKit(page, {delay: LATENCY_MS});

    await expect(getTableBox(page)).toHaveAttribute('aria-busy', 'true');
    await expect(getUserRowCheckbox(page, 'Ada Yılmaz')).toHaveCount(0);
    const pending = await readDigest(page);
    expect(
      pending.elements.filter(element => element.slot === 'skeleton').length,
    ).toBeGreaterThan(0);

    await expect(getRangeStatus(page)).toHaveText('1-10 / 96');

    await expect(getTableBox(page)).toHaveAttribute('aria-busy', 'false');
    const loaded = await readDigest(page);
    expect(
      loaded.elements.filter(element => element.slot === 'skeleton'),
    ).toEqual([]);
  });

  test('a slow page change keeps the previous page on screen, dimmed, until the next one lands', async ({
    page,
  }) => {
    await openTableKit(page, {delay: LATENCY_MS});
    await expect(getRangeStatus(page)).toHaveText('1-10 / 96');

    await getPageLink(page, '2').click();

    await Promise.all([
      expectFixtureState(page).toMatchObject({
        isPlaceholderData: true,
        list: {pageNumber: 2},
      }),
      expect(getTableBox(page)).toHaveAttribute('aria-busy', 'true'),
      expect(getBodyRows(page).first()).toContainText('Ada Yılmaz'),
      expect(getBodyRows(page).first()).toHaveCSS('opacity', '0.6'),
    ]);

    await Promise.all([
      expect(getBodyRows(page).first()).toContainText('İsmail Yılmaz'),
      expectFixtureState(page).toMatchObject({isPlaceholderData: false}),
      expect(getBodyRows(page).first()).toHaveCSS('opacity', '1'),
      expect(getTableBox(page)).toHaveAttribute('aria-busy', 'false'),
    ]);
  });

  test('a refetch re-runs the query and keeps the identical rows on screen, undimmed', async ({
    page,
  }) => {
    const {promise: refetchRelease, resolve: releaseRefetch} =
      Promise.withResolvers();
    const hits = await stubUsersPage(
      page,
      1,
      respondInSequence(
        getUsersPageResponse(1),
        refetchRelease.then(() => getUsersPageResponse(1)),
      ),
    );
    await openApiTableKit(page);
    const rows = await getBodyRows(page).allTextContents();

    await clickButton(page, 'Yenile');

    await Promise.all([
      expect.poll(() => hits.length).toBe(2),
      expectFixtureState(page).toMatchObject({fetchStatus: 'fetching'}),
    ]);
    const [rowStyle] = await Promise.all([
      getBodyRows(page)
        .first()
        .evaluate(row => [
          getComputedStyle(row).opacity,
          row.getAnimations().length,
        ]),
      expect(getBodyRows(page)).toHaveText(rows),
    ]);
    expect(rowStyle).toEqual(['1', 0]);

    releaseRefetch();

    await expectFixtureState(page).toMatchObject({fetchStatus: 'idle'});
    await expect(getBodyRows(page)).toHaveText(rows);
    expect(hits).toHaveLength(2);
  });

  test('a mutate during a refetch keeps the rows on screen and lands the new data', async ({
    page,
  }) => {
    await openTableKit(page, {delay: LATENCY_MS});
    await expect(getRangeStatus(page)).toHaveText('1-10 / 96');

    await page.getByRole('button', {name: 'Yenile'}).click();
    await expect(getTableBox(page)).toHaveAttribute('aria-busy', 'true');
    await page.getByRole('button', {name: 'İlk kullanıcıyı değiştir'}).click();

    await expect(getRow(page, 'Ada Yılmaz')).toContainText('Aktif');
    await expect(getBodyRows(page)).toHaveCount(10);

    await expect(getRow(page, 'Ada Yılmaz')).toContainText('Pasif');
    await expect(getTableBox(page)).toHaveAttribute('aria-busy', 'false');
    await expect(getBodyRows(page)).toHaveCount(10);
  });
});

test.describe('table kit over the API', () => {
  test.describe(`with a refetch failing with ${UNAVAILABLE_FAILURE.name}`, () => {
    test.use({
      allowedConsoleError: getUsersFailurePattern(1, UNAVAILABLE_FAILURE),
    });

    test('keeps the rows and the pagination through one retry and raises one refetch toast', async ({
      page,
    }) => {
      const hits = await stubUsersFailingAfterLoad(page, UNAVAILABLE_FAILURE);
      await openApiTableKit(page);
      const rows = await getBodyRows(page).allTextContents();

      await clickButton(page, 'Yenile');

      await expectFixtureState(page).toMatchObject(SETTLED_ERROR);
      await Promise.all([
        expect(getBodyRows(page)).toHaveText(rows),
        expect(
          getUserTable(page).getByRole('button', {name: 'Retry'}),
        ).toHaveCount(0),
        expect(getPagination(page)).toBeVisible(),
        expectToasts(page, [REFETCH_FAILURE_TOAST]),
      ]);
      expect(hits).toHaveLength(3);
    });
  });

  test.describe(`with a refetch failing with ${FORBIDDEN_FAILURE.name}`, () => {
    test.use({
      allowedConsoleError: getUsersFailurePattern(1, FORBIDDEN_FAILURE),
    });

    test('replaces the rows with the error alert at once, with no retry and no toast', async ({
      page,
    }) => {
      const hits = await stubUsersFailingAfterLoad(page, FORBIDDEN_FAILURE);
      await openApiTableKit(page);

      await clickButton(page, 'Yenile');

      const alert = getUserTable(page).getByRole('alert');
      await Promise.all([
        expect(alert).toContainText(LOAD_FAILURE),
        expect(alert.getByRole('button', {name: 'Retry'})).toBeVisible(),
        expectFixtureState(page).toMatchObject(SETTLED_ERROR),
        expect(getBodyRows(page)).toHaveCount(0),
      ]);
      await expectToasts(page, []);
      expect(hits).toHaveLength(2);
    });
  });

  test.describe(`with a page change failing with ${UNAVAILABLE_FAILURE.name}`, () => {
    test.use({
      allowedConsoleError: getUsersFailurePattern(2, UNAVAILABLE_FAILURE),
    });

    test('keeps the previous page dimmed through the retry, then renders the error alert, whose retry lands the page', async ({
      page,
    }) => {
      const {promise: retryRelease, resolve: releaseRetry} =
        Promise.withResolvers();
      const [, pageTwoHits] = await Promise.all([
        stubUsersPage(page, 1),
        stubUsersPage(
          page,
          2,
          respondInSequence(
            UNAVAILABLE_FAILURE.response,
            retryRelease.then(() => UNAVAILABLE_FAILURE.response),
            getUsersPageResponse(2),
          ),
        ),
      ]);
      await openApiTableKit(page);
      const rows = await getBodyRows(page).allTextContents();
      const alert = getUserTable(page).getByRole('alert');

      await getPageLink(page, '2').click();

      await expect.poll(() => pageTwoHits.length).toBe(2);
      await Promise.all([
        expectFixtureState(page).toMatchObject({
          isPlaceholderData: true,
          list: {pageNumber: 2},
        }),
        expect(getBodyRows(page)).toHaveText(rows),
        expect(getBodyRows(page).first()).toHaveCSS('opacity', '0.6'),
        expect(alert).toHaveCount(0),
      ]);

      releaseRetry();

      await Promise.all([
        expect(alert).toContainText(LOAD_FAILURE),
        expectFixtureState(page).toMatchObject(SETTLED_ERROR),
        expect(getBodyRows(page)).toHaveCount(0),
      ]);
      await Promise.all([
        expectSearchParams(page).toEqual({source: 'api', pageNumber: '2'}),
        expectToasts(page, []),
      ]);
      expect(pageTwoHits).toHaveLength(2);

      await alert.getByRole('button', {name: 'Retry'}).click();

      await Promise.all([
        expect(getBodyRows(page).first()).toContainText('Kullanıcı 11'),
        expect(getBodyRows(page).last()).toContainText('Kullanıcı 20'),
        expect(getBodyRows(page)).toHaveCount(10),
        expect(alert).toHaveCount(0),
      ]);
      expect(pageTwoHits).toHaveLength(3);
    });
  });
});

test.describe('table kit filter options over the API', () => {
  test('a filter over a preloaded source lists the options it loaded', async ({
    page,
  }) => {
    await stubDepartments(page);
    await openTableKit(page, {options: 'api'});

    await getFacetTrigger(page, 'Departman').click();

    await Promise.all([
      expect(getFacetOptions(page)).toHaveText(
        API_DEPARTMENTS.map(department => department.label),
      ),
      expect(page.getByText(OPTIONS_LOAD_FAILURE)).toHaveCount(0),
    ]);
  });

  test.describe(`with its options failing with ${DEPARTMENTS_FAILURE.name}`, () => {
    test.use({allowedConsoleError: DEPARTMENTS_FAILURE_PATTERN});

    test('the popover shows the load failure in place of the options, while a static filter keeps its own', async ({
      page,
    }) => {
      await stubDepartments(page, () => DEPARTMENTS_FAILURE.response);
      await openTableKit(page, {options: 'api'});
      await expectFixtureState(page).toMatchObject({
        departments: SETTLED_ERROR,
      });

      await getFacetTrigger(page, 'Departman').click();

      await Promise.all([
        expect(page.getByText(OPTIONS_LOAD_FAILURE)).toBeVisible(),
        expect(getFacetOptions(page)).toHaveCount(0),
      ]);

      await page.keyboard.press('Escape');
      await expect(getFacetList(page)).toHaveCount(0);
      await getFacetTrigger(page, 'Durum').click();

      await Promise.all([
        expect(getFacetOptions(page)).toHaveText(['Aktif', 'Pasif']),
        expect(page.getByText(OPTIONS_LOAD_FAILURE)).toBeHidden(),
      ]);
      await expectToasts(page, []);
    });
  });

  test.describe(`with its options refetch failing with ${DEPARTMENTS_FAILURE.name}`, () => {
    test.use({allowedConsoleError: DEPARTMENTS_FAILURE_PATTERN});

    test('the popover swaps the options for the load failure, keeping the selection’s label and its clear action, with no toast', async ({
      page,
    }) => {
      const hits = await stubDepartments(
        page,
        respondInSequence(
          getDepartmentsResponse(),
          DEPARTMENTS_FAILURE.response,
        ),
      );
      await openTableKit(page, {options: 'api', department: 'hukuk'});
      await expect(getFacetTrigger(page, 'Departman')).toContainText('Hukuk');

      await clickButton(page, 'Departmanları yeniden yükle');
      await expectFixtureState(page).toMatchObject({
        departments: SETTLED_ERROR,
      });
      await getFacetTrigger(page, 'Departman').click();

      await Promise.all([
        expect(page.getByText(OPTIONS_LOAD_FAILURE)).toBeVisible(),
        expect(getFacetOptions(page)).toHaveText(['Clear filter']),
        expect(getFacetTrigger(page, 'Departman')).toContainText('Hukuk'),
      ]);
      await expectToasts(page, []);
      expect(hits).toHaveLength(3);
    });
  });
});

test.describe('table kit row variants', () => {
  test.use({reducedMotion: 'reduce'});

  test('a row the caller sets apart rests in a tint of its own and lights up on hover like any row', async ({
    page,
  }) => {
    await openTableKit(page);
    const restingColour = await readRowColour(page, 'Barış Yılmaz');
    const subtleColour = await readRowColour(page, 'Çağla Yılmaz');
    expect(subtleColour).not.toBe(restingColour);

    await getRow(page, 'Barış Yılmaz').hover();
    await expect
      .poll(() => readRowColour(page, 'Barış Yılmaz'))
      .not.toBe(restingColour);
    const hoverColour = await readRowColour(page, 'Barış Yılmaz');

    await getRow(page, 'Çağla Yılmaz').hover();
    await expect
      .poll(() => readRowColour(page, 'Çağla Yılmaz'))
      .toBe(hoverColour);
  });

  test('a variant the table does not know falls back to the default row', async ({
    page,
  }) => {
    await openTableKit(page, {rowVariant: 'unknown'});

    expect(await readRowColour(page, 'Çağla Yılmaz')).toBe(
      await readRowColour(page, 'Barış Yılmaz'),
    );
  });
});

test.describe('table kit row actions', () => {
  test('inline row actions report their row and follow the row’s abilities', async ({
    page,
  }) => {
    await openTableKit(page);

    await getRow(page, 'Ada Yılmaz')
      .getByRole('button', {name: 'Düzenle'})
      .click();

    await expectFixtureState(page).toMatchObject({
      rowAction: {key: 'edit', id: 1},
    });
    await expect(
      getRow(page, 'Ada Yılmaz').getByRole('button', {name: 'Sil'}),
    ).toBeVisible();
    await expect(
      getRow(page, 'Çağla Yılmaz').getByRole('button', {name: 'Sil'}),
    ).toHaveCount(0);
  });

  test('an inline row action with an address is a link to it', async ({
    page,
  }) => {
    await openTableKit(page);
    const history = getRow(page, 'Ada Yılmaz').getByRole('link', {
      name: 'Geçmiş',
    });

    await expect(history).toHaveAttribute(
      'href',
      '/fixtures/table-kit?history=1',
    );
    await history.click();

    await expectSearchParams(page).toEqual({history: '1'});
  });

  test.describe('in a table wider than its container', () => {
    test.use({viewport: NARROW_VIEWPORT, reducedMotion: 'reduce'});

    test('the actions collapse into a menu in a pinned, opaque cell', async ({
      page,
    }) => {
      await openTableKit(page);
      const trigger = getRow(page, 'Ada Yılmaz').getByRole('button', {
        name: 'Actions',
      });
      await expect(trigger).toBeVisible();

      const digest = await readDigest(page);
      const pinned = digest.elements.filter(
        element =>
          element.slot === 'table-cell' && element.style.position === 'sticky',
      );
      expect(pinned.length).toBeGreaterThan(0);
      for (const cell of pinned) {
        expect(cell.style.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
      }

      await trigger.click();
      await page.getByRole('menuitem', {name: 'Sil'}).click();

      await expectFixtureState(page).toMatchObject({
        rowAction: {key: 'delete', id: 1},
      });
    });

    test('a row holding an open menu keeps its hover colour, and its pinned cell follows', async ({
      page,
    }) => {
      await openTableKit(page);
      const restingColour = await readRowColour(page, 'Barış Yılmaz');

      await getRow(page, 'Barış Yılmaz').hover();
      await expect
        .poll(() => readRowColour(page, 'Barış Yılmaz'))
        .not.toBe(restingColour);
      const hoverColour = await readRowColour(page, 'Barış Yılmaz');

      await getRow(page, 'Ada Yılmaz')
        .getByRole('button', {name: 'Actions'})
        .click();
      await expect(page.getByRole('menu')).toBeVisible();
      await page.mouse.move(0, 0);

      await expect
        .poll(() => readRowColour(page, 'Ada Yılmaz'))
        .toBe(hoverColour);
      const firstPinnedCell = findElement(
        await readDigest(page),
        element =>
          element.slot === 'table-cell' && element.style.position === 'sticky',
      );
      expect(firstPinnedCell.style.backgroundColor).toBe(hoverColour);
    });
  });
});

test.describe('static table', () => {
  function getCityTable(page) {
    return page.getByRole('region', {name: 'Şehirler'});
  }

  function getCityRows(page) {
    return getTableRows(getCityTable(page));
  }

  function sortCities(page, column, direction) {
    return sortBy(getColumnHeader(getCityTable(page), column), direction);
  }

  test('sorts client-side with the app locale’s collation, leaving the URL alone', async ({
    page,
  }) => {
    await openTableKit(page);
    const rows = getCityRows(page);

    await sortCities(page, 'Şehir', 'Ascending');

    await expect(rows).toHaveText([
      /^Ağrı/,
      /^Çanakkale/,
      /^Cizre/,
      /^İnegöl/,
      /^Isparta/,
      /^Zonguldak/,
    ]);
    await expect(getColumnHeader(getCityTable(page), 'Şehir')).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await expectSearchParams(page).toEqual({});

    await sortCities(page, 'Şehir', 'Descending');

    await expect(rows.first()).toContainText('Zonguldak');
    await expect(rows.last()).toContainText('Ağrı');
  });

  test('compares numbers inside text numerically', async ({page}) => {
    await openTableKit(page);

    await sortCities(page, 'Bölge', 'Ascending');

    await expect(getCityRows(page)).toHaveText([
      /Bölge 1$/,
      /Bölge 2$/,
      /Bölge 3$/,
      /Bölge 9$/,
      /Bölge 10$/,
      /Bölge 12$/,
    ]);
  });
});
