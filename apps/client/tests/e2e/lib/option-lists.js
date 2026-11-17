import {delay, range} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {DEFAULT_LOCALE} from '@repo/shared/constants/app.js';
import {toOffsetPagePayload} from '@repo/shared/lib/pagination.js';
import {
  getApiFailure,
  getApiUrl,
  getFailedRequestPattern,
  getSuccessEnvelope,
  stubApi,
} from './api.js';

export const OPTIONS_LOAD_FAILURE = 'Options could not be loaded.';

const DEPARTMENTS_PATH = '/fixtures/departments';

const FIXTURE_USERS_PATH = '/fixtures/users';

export const API_DEPARTMENTS = Object.freeze([
  {id: 'destek', label: 'Destek'},
  {id: 'hukuk', label: 'Hukuk'},
]);

export const DEPARTMENTS_FAILURE = getApiFailure(
  StatusCodes.SERVICE_UNAVAILABLE,
  'Departmanlar yüklenemedi.',
);

export const DEPARTMENTS_FAILURE_PATTERN = getFailedRequestPattern({
  [DEPARTMENTS_PATH]: [DEPARTMENTS_FAILURE.status],
});

export function getDepartmentsResponse() {
  return {json: getSuccessEnvelope(API_DEPARTMENTS)};
}

export function stubDepartments(page, respond = getDepartmentsResponse) {
  return stubApi(page, getApiUrl(DEPARTMENTS_PATH), respond);
}

export function getFixtureUserLabel(id) {
  return `Kullanıcı ${id}`;
}

export function getFixtureUsersPath(query) {
  return `${FIXTURE_USERS_PATH}?${new URLSearchParams(query)}`;
}

function isFixtureUsersUrl(url) {
  return `${url.origin}${url.pathname}` === getApiUrl(FIXTURE_USERS_PATH);
}

function isFixtureUserMatch(id, {ids, search}) {
  return (
    (!ids.length || ids.includes(id)) &&
    (!search ||
      getFixtureUserLabel(id)
        .toLocaleLowerCase(DEFAULT_LOCALE)
        .includes(search))
  );
}

function getFixtureUsersPage(url, total) {
  const {searchParams} = url;
  const filters = {
    ids: searchParams.getAll('id').map(Number),
    search: searchParams.get('search')?.toLocaleLowerCase(DEFAULT_LOCALE),
  };
  const pageNumber = Number(searchParams.get('pageNumber'));
  const pageSize = Number(searchParams.get('pageSize'));
  const offset = (pageNumber - 1) * pageSize;
  const matches = range(1, total + 1).filter(id =>
    isFixtureUserMatch(id, filters),
  );
  return toOffsetPagePayload({
    items: matches
      .slice(offset, offset + pageSize)
      .map(id => ({id, name: getFixtureUserLabel(id)})),
    totalItemCount: matches.length,
    pageNumber,
    pageSize,
    offset,
  });
}

export function stubFixtureUsers(
  page,
  {
    total = 0,
    latency = 0,
    respond = ({url}) => ({
      json: getSuccessEnvelope(getFixtureUsersPage(url, total)),
    }),
  },
) {
  return stubApi(page, isFixtureUsersUrl, async hit => {
    await delay(latency);
    return respond(hit);
  });
}
