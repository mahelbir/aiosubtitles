import {keepPreviousData, useQueryClient} from '@tanstack/react-query';
import {delay} from 'es-toolkit';
import {withApiQuery} from '@repo/shared/lib/url-query.js';
import {env} from '@/config/env';
import {requestApi} from '@/lib/api-request';
import {optionSource} from '@/lib/option-source';
import {
  useAppMutation,
  useAppQuery,
  useOptionsQuery,
  useToastMutation,
} from '@/lib/query';
import {fakeUsers} from './lib/fake-users';
import {readFakeLedger} from './lib/fake-ledger';
import {findFixturePerson} from './lib/fake-people';

export const fixtureKeys = {
  all: ['fixtures'],
  users: () => [...fixtureKeys.all, 'users'],
  userList: (source, total, query) => [
    ...fixtureKeys.users(),
    'list',
    source,
    total,
    query,
  ],
  userOptions: (source, total) => [
    ...fixtureKeys.users(),
    'options',
    source,
    total,
  ],
  departments: source => [...fixtureKeys.all, 'departments', source],
  ledger: () => [...fixtureKeys.all, 'ledger'],
  feed: () => [...fixtureKeys.all, 'feed'],
  record: () => [...fixtureKeys.all, 'record'],
  entities: () => [...fixtureKeys.all, 'entities'],
  entity: id => [...fixtureKeys.entities(), id],
  people: () => [...fixtureKeys.all, 'people'],
  person: id => [...fixtureKeys.people(), id],
};

async function apiData(path, {query, ...options} = {}) {
  await Promise.resolve();
  return requestApi(env.API_URL, withApiQuery(path, query), options);
}

function apiEnvelope(path, options = {}) {
  return apiData(path, {...options, envelope: true});
}

export function submitFormPolicies(values) {
  return apiEnvelope('/fixtures/form-policies', {method: 'POST', body: values});
}

export async function fetchFixtureUsers({total, query, latency, signal}) {
  await delay(latency, {signal});
  return fakeUsers.list({total, query});
}

export function fetchApiFixtureUsers({query, signal}) {
  return apiData('/fixtures/users', {query, signal});
}

export async function fetchFixtureDepartments({latency, signal}) {
  await delay(latency, {signal});
  return fakeUsers.departments();
}

export function fetchApiFixtureDepartments({signal}) {
  return apiData('/fixtures/departments', {signal});
}

function toDepartmentOption(department) {
  return {value: department.id, label: department.label};
}

const selectDepartmentOptions = departments =>
  departments.map(toDepartmentOption);

function getFixtureDepartmentsQuery({source, latency}) {
  return {
    queryKey: fixtureKeys.departments(source),
    queryFn: ({signal}) =>
      source === 'api'
        ? fetchApiFixtureDepartments({signal})
        : fetchFixtureDepartments({latency, signal}),
    select: selectDepartmentOptions,
  };
}

export function toFixtureUserOption(user) {
  return {value: user.id, label: user.name};
}

function getFixtureUserPages({source, total, latency}) {
  return {
    queryKey: fixtureKeys.userOptions(source, total),
    fetchPage: (query, {signal}) =>
      source === 'api'
        ? fetchApiFixtureUsers({query, signal})
        : fetchFixtureUsers({total, query, latency, signal}),
    toOption: toFixtureUserOption,
  };
}

export const fixtureUserOptionSources = {
  preloadedPages: scenario =>
    optionSource.preloadedPages(getFixtureUserPages(scenario)),
  remote: scenario => optionSource.remote(getFixtureUserPages(scenario)),
};

export function getFixtureDepartmentOptionSource(scenario) {
  return optionSource.preloaded(getFixtureDepartmentsQuery(scenario));
}

export async function toggleFixtureUser({total, id}) {
  return fakeUsers.toggle({total, id});
}

export async function fetchFixtureLedger({signal}) {
  await delay(300, {signal});
  return readFakeLedger();
}

export async function fetchFixtureFeed() {
  return {message: 'Akış güncel.'};
}

export function postFixtureEntry() {
  return apiEnvelope('/fixtures/entries', {method: 'POST'});
}

export function fetchFixtureRecord({signal} = {}) {
  return apiData('/fixtures/record', {signal});
}

export function fetchFixtureRecordEnvelope() {
  return apiEnvelope('/fixtures/record');
}

export function searchFixtureRecords(query) {
  return apiData('/fixtures/records', {query});
}

export function fetchFixtureEntity(id, {signal}) {
  return apiData(`/fixtures/entities/${id}`, {signal});
}

export async function fetchFixturePerson({id, latency, signal}) {
  await delay(latency, {signal});
  return findFixturePerson(id);
}

export function useSubmitFormPolicies(options) {
  return useAppMutation(
    {isFormBound: true, mutationFn: submitFormPolicies},
    options,
  );
}

export function useFixtureUsers({source, total, query, latency}, options) {
  return useAppQuery(
    {
      queryKey: fixtureKeys.userList(source, total, query),
      queryFn: ({signal}) =>
        source === 'api'
          ? fetchApiFixtureUsers({query, signal})
          : fetchFixtureUsers({total, query, latency, signal}),
      placeholderData: keepPreviousData,
    },
    options,
  );
}

export function useFixtureDepartments(scenario, options) {
  return useOptionsQuery(getFixtureDepartmentsQuery(scenario), options);
}

export function useToggleFixtureUser(options) {
  return useAppMutation(
    {mutationFn: toggleFixtureUser, invalidates: fixtureKeys.users()},
    options,
  );
}

export function useFixtureLedger(options) {
  return useAppQuery(
    {queryKey: fixtureKeys.ledger(), queryFn: fetchFixtureLedger},
    options,
  );
}

export function useFixtureFeed(options) {
  return useAppQuery(
    {queryKey: fixtureKeys.feed(), queryFn: fetchFixtureFeed},
    options,
  );
}

export function useFixtureRecord(options) {
  return useAppQuery(
    {queryKey: fixtureKeys.record(), queryFn: fetchFixtureRecord},
    options,
  );
}

export function useFixtureEntity(id, options) {
  return useAppQuery(
    {
      queryKey: fixtureKeys.entity(id),
      queryFn: ({signal}) => fetchFixtureEntity(id, {signal}),
      enabled: Boolean(id),
    },
    options,
  );
}

export function useFixturePerson({id, latency}, options) {
  return useAppQuery(
    {
      queryKey: fixtureKeys.person(id),
      queryFn: ({signal}) => fetchFixturePerson({id, latency, signal}),
      enabled: Boolean(id),
    },
    options,
  );
}

export function usePostFixtureEntry(options) {
  const queryClient = useQueryClient();
  return useAppMutation(
    {
      mutationFn: postFixtureEntry,
      onSuccess: envelope => {
        queryClient.setQueryData(fixtureKeys.ledger(), ledger =>
          ledger ? {...ledger, lastEntry: envelope.data} : ledger,
        );
      },
    },
    options,
  );
}

export function useSnapshotFixtureEntry(options) {
  const queryClient = useQueryClient();
  return useAppMutation(
    {
      mutationFn: postFixtureEntry,
      onMutate: () => queryClient.getQueryData(fixtureKeys.ledger()),
    },
    options,
  );
}

export function useInvalidatingFixtureEntry(options) {
  return useAppMutation(
    {mutationFn: postFixtureEntry, invalidates: fixtureKeys.ledger()},
    options,
  );
}

export function useToastFixtureEntry(options) {
  return useToastMutation({mutationFn: postFixtureEntry}, options);
}
