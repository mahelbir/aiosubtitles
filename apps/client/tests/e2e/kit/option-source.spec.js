import {escapeRegExp, range} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {
  MAX_FILTER_VALUES,
  MAX_PAGE_SIZE,
} from '@repo/shared/constants/pagination.js';
import {
  SEARCHABLE_THRESHOLD,
  SEARCH_DEBOUNCE_MS,
} from '../../../src/config/search.js';
import {OPTION_PAGE_SIZE} from '../../../src/lib/option-source.js';
import {getApiFailure, getFailedRequestPattern} from '../lib/api.js';
import {expectFixtureState, openFixture} from '../lib/fixture-page.js';
import {
  API_DEPARTMENTS,
  OPTIONS_LOAD_FAILURE,
  getFixtureUserLabel,
  getFixtureUsersPath,
  stubDepartments,
  stubFixtureUsers,
} from '../lib/option-lists.js';
import {clickButton} from '../lib/page.js';
import {expect, test} from '../lib/test.js';
import {expectToasts} from '../lib/toasts.js';

const SEARCH_SETTLE_MS = 2 * SEARCH_DEBOUNCE_MS;
const LATENCY_MS = 1500;
const WITHIN_CAP_TOTAL = 60;
const PAST_CAP_TOTAL = 150;
const PAGED_TOTAL = 45;
const WHOLE_LIST_ERROR =
  'This control needs a source that loads the whole list.';
const USERS_FAILURE = getApiFailure(
  StatusCodes.SERVICE_UNAVAILABLE,
  'Kullanıcılar yüklenemedi.',
);

function openOptionSource(page, searchParams) {
  return openFixture(page, 'option-source', searchParams);
}

function getSearchBox(page) {
  return page.getByRole('searchbox', {name: 'Ara'});
}

function getUserLabels(ids) {
  return ids.map(getFixtureUserLabel);
}

function getFirstPageLabels() {
  return getUserLabels(range(1, OPTION_PAGE_SIZE + 1));
}

function getSearches(hits) {
  return hits.map(hit => hit.url.searchParams.get('search')).filter(Boolean);
}

function getIdGroups(hits) {
  return hits
    .map(hit => hit.url.searchParams.getAll('id'))
    .filter(ids => ids.length > 0);
}

test.describe('option source', () => {
  test('a fixed source lists its options and turns searchable past ten', async ({
    page,
  }) => {
    await openOptionSource(page, {kind: 'fixed', total: SEARCHABLE_THRESHOLD});

    await expectFixtureState(page, 'listed').toHaveLength(SEARCHABLE_THRESHOLD);
    await expectFixtureState(page).toMatchObject({
      total: SEARCHABLE_THRESHOLD,
      isSearchable: false,
      isRemote: false,
    });

    await openOptionSource(page, {
      kind: 'fixed',
      total: SEARCHABLE_THRESHOLD + 1,
    });

    await expectFixtureState(page).toMatchObject({
      total: SEARCHABLE_THRESHOLD + 1,
      isSearchable: true,
    });
  });

  test('a preloaded source loads once on mount, before anything opens', async ({
    page,
  }) => {
    const hits = await stubDepartments(page);

    await openOptionSource(page, {kind: 'preloaded', api: true});

    await expectFixtureState(page, 'listed').toEqual(
      API_DEPARTMENTS.map(department => department.label),
    );
    expect(hits).toHaveLength(1);
  });

  test('a paged source within the cap loads one page of a hundred and searches locally', async ({
    page,
  }) => {
    const hits = await stubFixtureUsers(page, {total: WITHIN_CAP_TOTAL});
    await openOptionSource(page, {
      kind: 'pages',
      total: WITHIN_CAP_TOTAL,
      api: true,
    });
    await expectFixtureState(page, 'listed').toHaveLength(WITHIN_CAP_TOTAL);

    expect(hits.map(hit => Object.fromEntries(hit.url.searchParams))).toEqual([
      {pageNumber: '1', pageSize: String(MAX_PAGE_SIZE)},
    ]);

    await getSearchBox(page).pressSequentially('Ada');
    await page.waitForTimeout(SEARCH_SETTLE_MS);

    expect(hits).toHaveLength(1);
    await expectFixtureState(page).toMatchObject({
      listed: [],
      total: WITHIN_CAP_TOTAL,
      isRemote: false,
    });
  });

  test('a paged source past the cap searches on the server', async ({page}) => {
    const hits = await stubFixtureUsers(page, {total: PAST_CAP_TOTAL});
    await openOptionSource(page, {
      kind: 'pages',
      total: PAST_CAP_TOTAL,
      api: true,
    });
    await expectFixtureState(page).toMatchObject({
      listed: getFirstPageLabels(),
      total: PAST_CAP_TOTAL,
      isRemote: true,
    });

    await getSearchBox(page).pressSequentially('Ada');

    await expect.poll(() => getSearches(hits)).toEqual(['Ada']);
  });

  test('a remote source waits for the debounce and the minimum length', async ({
    page,
  }) => {
    const hits = await stubFixtureUsers(page, {total: PAST_CAP_TOTAL});
    await openOptionSource(page, {
      kind: 'remote',
      total: PAST_CAP_TOTAL,
      api: true,
    });
    await expectFixtureState(page, 'listed').toEqual(getFirstPageLabels());
    const search = getSearchBox(page);

    await search.pressSequentially('A');
    await page.waitForTimeout(SEARCH_SETTLE_MS);

    expect(getSearches(hits)).toEqual([]);

    await search.pressSequentially('d');

    await expect.poll(() => getSearches(hits)).toEqual(['Ad']);

    await search.pressSequentially('ay');

    await expect.poll(() => getSearches(hits)).toEqual(['Ad', 'Aday']);
  });

  test('a remote source keeps its unsearched total while a search narrows the list', async ({
    page,
  }) => {
    await openOptionSource(page, {kind: 'remote', total: PAST_CAP_TOTAL});
    await expectFixtureState(page, 'listed').toHaveLength(OPTION_PAGE_SIZE);

    await getSearchBox(page).pressSequentially('a Ay');

    await expectFixtureState(page, 'listed').toEqual([
      'Ada Aydın',
      'Çağla Aydın',
      'Fatma Aydın',
    ]);
    await expectFixtureState(page).toMatchObject({
      total: PAST_CAP_TOTAL,
      isSearchable: true,
      isRemote: true,
    });
  });

  test('a remote source counts the matches of its search apart from its unsearched total', async ({
    page,
  }) => {
    await openOptionSource(page, {kind: 'remote', total: PAST_CAP_TOTAL});
    await expectFixtureState(page).toMatchObject({
      total: PAST_CAP_TOTAL,
      matchTotal: PAST_CAP_TOTAL,
    });

    await getSearchBox(page).pressSequentially('a Ay');

    await expectFixtureState(page, 'listed').toHaveLength(3);
    await expectFixtureState(page).toMatchObject({
      total: PAST_CAP_TOTAL,
      matchTotal: 3,
    });
  });

  test('a remote source pages on demand and reports when more remain', async ({
    page,
  }) => {
    await openOptionSource(page, {kind: 'remote', total: PAGED_TOTAL});
    await expectFixtureState(page).toMatchObject({hasNextPage: true});
    await expectFixtureState(page, 'listed').toHaveLength(OPTION_PAGE_SIZE);

    await clickButton(page, 'Daha fazla');

    await expectFixtureState(page, 'listed').toHaveLength(2 * OPTION_PAGE_SIZE);

    await clickButton(page, 'Daha fazla');

    await expectFixtureState(page, 'listed').toHaveLength(PAGED_TOTAL);
    await expectFixtureState(page).toMatchObject({hasNextPage: false});
    await expect(
      page.getByRole('button', {name: 'Daha fazla', exact: true}),
    ).toBeDisabled();
  });

  test('selected values outside the window resolve their labels in groups of twenty', async ({
    page,
  }) => {
    const selected = range(101, 101 + MAX_FILTER_VALUES + 5);
    const hits = await stubFixtureUsers(page, {total: PAST_CAP_TOTAL});

    await openOptionSource(page, {
      kind: 'remote',
      total: PAST_CAP_TOTAL,
      api: true,
      selected: selected.join(','),
    });

    await expectFixtureState(page, 'knownLabels').toEqual(
      getUserLabels(selected),
    );
    const groups = getIdGroups(hits);
    expect(groups.map(ids => ids.length).toSorted((a, b) => a - b)).toEqual([
      5,
      MAX_FILTER_VALUES,
    ]);
    expect(
      groups
        .flat()
        .map(Number)
        .toSorted((a, b) => a - b),
    ).toEqual(selected);
  });

  test('a caller-known option needs no lookup', async ({page}) => {
    const hits = await stubFixtureUsers(page, {total: PAST_CAP_TOTAL});

    await openOptionSource(page, {
      kind: 'remote',
      total: PAST_CAP_TOTAL,
      api: true,
      selected: '120,121',
      known: '120',
    });

    await expect.poll(() => getIdGroups(hits)).toEqual([['121']]);
    await expectFixtureState(page, 'knownLabels').toEqual([
      expect.not.stringMatching(/120/),
      getFixtureUserLabel(121),
    ]);
  });

  test.describe(`with its pages failing with ${USERS_FAILURE.name}`, () => {
    test.use({
      allowedConsoleError: getFailedRequestPattern({
        [getFixtureUsersPath({pageNumber: 1, pageSize: OPTION_PAGE_SIZE})]: [
          USERS_FAILURE.status,
        ],
      }),
    });

    test('a failing source reports the failure in place of options, without a toast', async ({
      page,
    }) => {
      await stubFixtureUsers(page, {respond: () => USERS_FAILURE.response});

      await openOptionSource(page, {kind: 'remote', api: true});

      await expectFixtureState(page).toMatchObject({
        listed: [],
        hasFailed: true,
        emptyMessage: OPTIONS_LOAD_FAILURE,
      });
      await expectToasts(page, []);
    });
  });

  test('an unresolvable selected value falls back to its raw value', async ({
    page,
  }) => {
    const hits = await stubFixtureUsers(page, {total: PAST_CAP_TOTAL});

    await openOptionSource(page, {
      kind: 'remote',
      total: PAST_CAP_TOTAL,
      api: true,
      selected: '999,121',
    });

    await expectFixtureState(page).toMatchObject({
      knownLabels: ['999', getFixtureUserLabel(121)],
      hasFailed: false,
    });
    expect(getIdGroups(hits)).toEqual([['121', '999']]);
  });

  test('a stale search response never replaces a newer one', async ({page}) => {
    const hits = await stubFixtureUsers(page, {
      total: PAST_CAP_TOTAL,
      latency: LATENCY_MS,
    });
    await openOptionSource(page, {
      kind: 'remote',
      total: PAST_CAP_TOTAL,
      api: true,
    });
    await expectFixtureState(page, 'listed').toEqual(getFirstPageLabels());
    const search = getSearchBox(page);

    await search.pressSequentially('Ad');
    await expect.poll(() => getSearches(hits)).toEqual(['Ad']);
    await search.clear();
    await page.waitForTimeout(LATENCY_MS + SEARCH_SETTLE_MS);

    await expectFixtureState(page, 'listed').toEqual(getFirstPageLabels());
  });

  test('the matcher ignores case only, in the app locale', async ({page}) => {
    await openOptionSource(page, {kind: 'fixed'});
    const search = getSearchBox(page);

    await search.fill('ÇANAKKALE');

    await expectFixtureState(page, 'listed').toEqual(['Çanakkale']);

    await search.fill('canakkale');

    await expectFixtureState(page, 'listed').toEqual([]);

    await search.fill('İSTANBUL');

    await expectFixtureState(page, 'listed').toEqual(['İstanbul']);

    await search.fill('KÂHTA');

    await expectFixtureState(page, 'listed').toEqual(['Kâhta']);

    await search.fill('kahta');

    await expectFixtureState(page, 'listed').toEqual([]);
  });

  test('a whole-list control takes a preloaded source', async ({page}) => {
    await stubDepartments(page);

    await openOptionSource(page, {kind: 'preloaded', api: true, whole: true});

    await expectFixtureState(page).toMatchObject({
      listed: API_DEPARTMENTS.map(department => department.label),
      isPending: false,
      hasFailed: false,
    });
  });

  test.describe('given a paged source', () => {
    test.use({allowedConsoleError: new RegExp(escapeRegExp(WHOLE_LIST_ERROR))});

    for (const kind of ['pages', 'remote']) {
      test(`a whole-list control refuses a ${kind} source`, async ({page}) => {
        await openOptionSource(page, {kind, whole: true});

        await expect(
          page.getByRole('alert').filter({hasText: WHOLE_LIST_ERROR}),
        ).toBeVisible();
      });
    }
  });
});
