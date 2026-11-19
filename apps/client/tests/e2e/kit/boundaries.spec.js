import {StatusCodes} from 'http-status-codes';
import {
  FIXTURE_RECORD_PATH,
  getApiFailure,
  getApiUrl,
  getFailedRequestPattern,
  getSuccessEnvelope,
  getTransientFailures,
  respondInSequence,
  stubApi,
} from '../lib/api.js';
import {
  SETTLED_ERROR,
  expectFixtureState,
  goOffline,
  openFixture,
} from '../lib/fixture-page.js';
import {getLoadingStatus} from '../lib/locators.js';
import {clickButton} from '../lib/page.js';
import {expect, test} from '../lib/test.js';
import {REFETCH_FAILURE_TOAST, expectToasts} from '../lib/toasts.js';

const ENTITIES_URL = getApiUrl('/fixtures/entities');
const PAGE_ENTITY_ID = '7';
const PAGE_ENTITY_PATH = `/fixtures/entities/${PAGE_ENTITY_ID}`;
const PAGE_ENTITY_NAME = getEntityName(PAGE_ENTITY_ID);
const RECORD = {id: 1, name: 'Ada Yılmaz'};
const RENAMED_RECORD = {...RECORD, name: 'Ada Kaya'};
const LOAD_FAILURE = 'Kayıt yüklenemedi.';
const SETTLED_SUCCESS = {status: 'success', fetchStatus: 'idle'};
const UNAVAILABLE_FAILURE = getApiFailure(
  StatusCodes.SERVICE_UNAVAILABLE,
  LOAD_FAILURE,
);

const recordResponse = () => ({json: getSuccessEnvelope(RECORD)});

function getRecordFailurePattern(status) {
  return getFailedRequestPattern({[FIXTURE_RECORD_PATH]: [status]});
}

function getEntityName(id) {
  return `Kayıt ${id}`;
}

function getEntityResponse(id) {
  return {json: getSuccessEnvelope({id, name: getEntityName(id)})};
}

function getSection(page, name) {
  return page.getByRole('region', {name});
}

function getRecordSection(page) {
  return getSection(page, 'Sorgu sınırı');
}

function getPageEntitySection(page) {
  return getSection(page, 'Kayıt sayfası');
}

function stubRecord(page, respond = recordResponse) {
  return stubApi(page, getApiUrl(FIXTURE_RECORD_PATH), respond);
}

function stubEntities(page, respond) {
  return stubApi(page, url => url.href.startsWith(`${ENTITIES_URL}/`), respond);
}

function stubRecordFailingAfterLoad(page, failure) {
  return stubRecord(
    page,
    respondInSequence(recordResponse(), failure.response),
  );
}

function stubBothFailingAfterLoad(page, failure) {
  return Promise.all([
    stubRecordFailingAfterLoad(page, failure),
    stubApi(
      page,
      getApiUrl(PAGE_ENTITY_PATH),
      respondInSequence(getEntityResponse(PAGE_ENTITY_ID), failure.response),
    ),
  ]);
}

async function expectContentKept(page) {
  await Promise.all([
    expect(getRecordSection(page).getByText(RECORD.name)).toBeVisible(),
    expect(
      getPageEntitySection(page).getByText(PAGE_ENTITY_NAME),
    ).toBeVisible(),
    expect(getRecordSection(page).getByRole('alert')).toHaveCount(0),
    expect(getPageEntitySection(page).getByRole('alert')).toHaveCount(0),
  ]);
}

async function openLoaded(page, searchParams) {
  await openFixture(page, 'boundaries', searchParams);
  await expectContentKept(page);
}

test.describe('boundaries', () => {
  test.beforeEach(async ({page}) => {
    await Promise.all([
      stubRecord(page),
      stubEntities(page, ({url}) =>
        getEntityResponse(url.pathname.split('/').at(-1)),
      ),
    ]);
  });

  test.describe('QueryBoundary', () => {
    test('renders the loader while the query is pending, then its content', async ({
      page,
    }) => {
      const {promise, resolve} = Promise.withResolvers();
      await stubRecord(page, async () => {
        await promise;
        return recordResponse();
      });

      await openFixture(page, 'boundaries');

      const section = getRecordSection(page);
      await expect(getLoadingStatus(section)).toBeVisible();
      await expectFixtureState(page).toMatchObject({
        record: {status: 'pending', fetchStatus: 'fetching'},
      });

      resolve();

      await expect(section.getByText(RECORD.name)).toBeVisible();
      await expect(section.getByRole('status')).toHaveCount(0);
    });

    for (const failure of getTransientFailures(LOAD_FAILURE)) {
      test.describe(`with a query failing with ${failure.name}`, () => {
        test.use({
          allowedConsoleError: getRecordFailurePattern(failure.status),
        });

        test('renders the error alert once the retry is spent, with no toast, and its retry button refetches until the content arrives', async ({
          page,
        }) => {
          let isFailing = true;
          const hits = await stubRecord(page, () =>
            isFailing ? failure.response : recordResponse(),
          );

          await openFixture(page, 'boundaries');

          const alert = getRecordSection(page).getByRole('alert');
          await Promise.all([
            expect(alert).toContainText(failure.error.message),
            expectFixtureState(page).toMatchObject({record: SETTLED_ERROR}),
          ]);
          await expectToasts(page, []);
          expect(hits).toHaveLength(2);

          isFailing = false;
          await alert.getByRole('button', {name: 'Retry'}).click();

          await Promise.all([
            expect(getRecordSection(page).getByText(RECORD.name)).toBeVisible(),
            expect(alert).toHaveCount(0),
          ]);
          expect(hits).toHaveLength(3);
        });
      });

      test.describe(`with a refetch failing with ${failure.name}`, () => {
        test.use({
          allowedConsoleError: getRecordFailurePattern(failure.status),
        });

        test('keeps the content through one retry and raises the refetch toast instead of the error alert', async ({
          page,
        }) => {
          const hits = await stubRecordFailingAfterLoad(page, failure);
          await openLoaded(page);

          await clickButton(page, 'Kaydı yenile');

          await expectFixtureState(page).toMatchObject({record: SETTLED_ERROR});
          await Promise.all([
            expectContentKept(page),
            expectToasts(page, [REFETCH_FAILURE_TOAST]),
          ]);
          expect(hits).toHaveLength(3);
        });

        test('the next successful refetch lands the new data', async ({
          page,
        }) => {
          await stubRecordFailingAfterLoad(page, failure);
          await openLoaded(page);
          await clickButton(page, 'Kaydı yenile');
          await expectFixtureState(page).toMatchObject({record: SETTLED_ERROR});
          const recoveryHits = await stubRecord(page, () => ({
            json: getSuccessEnvelope(RENAMED_RECORD),
          }));

          await clickButton(page, 'Kaydı yenile');

          await Promise.all([
            expect(
              getRecordSection(page).getByText(RENAMED_RECORD.name),
            ).toBeVisible(),
            expectFixtureState(page).toMatchObject({record: SETTLED_SUCCESS}),
          ]);
          expect(recoveryHits).toHaveLength(1);
        });
      });
    }

    for (const failure of [
      StatusCodes.BAD_REQUEST,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.UNPROCESSABLE_ENTITY,
    ].map(status => getApiFailure(status, LOAD_FAILURE))) {
      test.describe(`with a refetch failing with ${failure.name}`, () => {
        test.use({
          allowedConsoleError: getRecordFailurePattern(failure.status),
        });

        test('replaces the content with the error alert at once, with no retry and no toast', async ({
          page,
        }) => {
          const hits = await stubRecordFailingAfterLoad(page, failure);
          await openLoaded(page);

          await clickButton(page, 'Kaydı yenile');

          const alert = getRecordSection(page).getByRole('alert');
          await Promise.all([
            expect(alert).toContainText(LOAD_FAILURE),
            expect(alert.getByRole('button', {name: 'Retry'})).toBeVisible(),
            expectFixtureState(page).toMatchObject({record: SETTLED_ERROR}),
            expect(getRecordSection(page).getByText(RECORD.name)).toHaveCount(
              0,
            ),
          ]);
          await expectToasts(page, []);
          expect(hits).toHaveLength(2);
        });
      });
    }

    test.describe(`with a refetch failing with ${UNAVAILABLE_FAILURE.name} under a query opting out through meta.isErrorHandled`, () => {
      test.use({
        allowedConsoleError: getRecordFailurePattern(
          UNAVAILABLE_FAILURE.status,
        ),
      });

      test('keeps its content and raises no toast', async ({page}) => {
        const hits = await stubRecordFailingAfterLoad(
          page,
          UNAVAILABLE_FAILURE,
        );
        await openLoaded(page, {isErrorHandled: true});

        await clickButton(page, 'Kaydı yenile');

        await expectFixtureState(page).toMatchObject({record: SETTLED_ERROR});
        await Promise.all([expectContentKept(page), expectToasts(page, [])]);
        expect(hits).toHaveLength(3);
      });
    });

    test.describe(`with two refetches failing together with ${UNAVAILABLE_FAILURE.name}`, () => {
      test.use({
        allowedConsoleError: getFailedRequestPattern({
          [FIXTURE_RECORD_PATH]: [UNAVAILABLE_FAILURE.status],
          [PAGE_ENTITY_PATH]: [UNAVAILABLE_FAILURE.status],
        }),
      });

      test('both keep their content under one shared toast', async ({page}) => {
        const [recordHits, entityHits] = await stubBothFailingAfterLoad(
          page,
          UNAVAILABLE_FAILURE,
        );
        await openLoaded(page);

        await clickButton(page, 'Tümünü yenile');

        await expectFixtureState(page).toMatchObject({
          record: SETTLED_ERROR,
          entity: SETTLED_ERROR,
        });
        await Promise.all([
          expectContentKept(page),
          expectToasts(page, [REFETCH_FAILURE_TOAST]),
        ]);
        expect([recordHits.length, entityHits.length]).toEqual([3, 3]);
      });

      test('a query opting out through meta.isErrorHandled leaves the toast to the query beside it', async ({
        page,
      }) => {
        await stubBothFailingAfterLoad(page, UNAVAILABLE_FAILURE);
        await openLoaded(page, {isErrorHandled: true});

        await clickButton(page, 'Tümünü yenile');

        await expectFixtureState(page).toMatchObject({
          record: SETTLED_ERROR,
          entity: SETTLED_ERROR,
        });
        await Promise.all([
          expectContentKept(page),
          expectToasts(page, [REFETCH_FAILURE_TOAST]),
        ]);
      });
    });

    test('a refetch while offline pauses with its content kept and no toast, then runs once back online', async ({
      page,
      context,
    }) => {
      const hits = await stubRecord(
        page,
        respondInSequence(recordResponse(), {
          json: getSuccessEnvelope(RENAMED_RECORD),
        }),
      );
      await openLoaded(page);
      await goOffline(page);

      await clickButton(page, 'Kaydı yenile');

      await expectFixtureState(page).toMatchObject({
        record: {status: 'success', fetchStatus: 'paused'},
      });
      await Promise.all([expectContentKept(page), expectToasts(page, [])]);
      expect(hits).toHaveLength(1);

      await context.setOffline(false);

      await Promise.all([
        expect(
          getRecordSection(page).getByText(RENAMED_RECORD.name),
        ).toBeVisible(),
        expectFixtureState(page).toMatchObject({record: SETTLED_SUCCESS}),
      ]);
      expect(hits).toHaveLength(2);
    });
  });
});
