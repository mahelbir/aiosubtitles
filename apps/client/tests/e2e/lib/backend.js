import {randomString} from 'melperjs';
import {MAX_PAGE_SIZE} from '@repo/shared/constants/pagination.js';
import {Permission} from '@repo/shared/constants/permission.js';
import {ADMIN_ROLE_SLUG} from '../../../../api/src/db/seeders/00001-roles.js';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
} from '../../../../api/src/db/seeders/00002-users.js';
import {E2E_SESSION_PATH} from '../../../../api/tests/e2e/paths.js';
import {getApiUrl} from './api.js';
import {getSessionStorageState, toPersistedSession} from './session.js';
import {expect} from './test.js';

export const NAME_PREFIX = 'e2e-';

export const ADMIN_ACCOUNT = Object.freeze({
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
});

const testKeys = new WeakMap();

export function getTestKey(testInfo) {
  if (!testKeys.has(testInfo)) {
    testKeys.set(testInfo, `${testInfo.testId.slice(0, 4)}${randomString(4)}`);
  }
  return testKeys.get(testInfo);
}

export function uniqueName(testInfo, prefix) {
  return `${NAME_PREFIX}${prefix}-${getTestKey(testInfo)}`;
}

export function uniqueEmail(testInfo, prefix) {
  return `${uniqueName(testInfo, prefix)}@example.com`;
}

export async function callApi(
  request,
  method,
  path,
  {token, data, params} = {},
) {
  const response = await request.fetch(getApiUrl(path), {
    method,
    data,
    params,
    headers: token ? {authorization: `Bearer ${token}`} : {},
  });
  await expect(response, `${method} ${path}`).toBeOK();
  return (await response.json()).data;
}

export function signIn(request, {email}) {
  return callApi(request, 'POST', E2E_SESSION_PATH, {data: {email}});
}

export async function openBackend(request, testInfo) {
  const {accessToken: token} = await signIn(request, ADMIN_ACCOUNT);
  const call = (method, path, options) =>
    callApi(request, method, path, {...options, token});
  const search = async (path, term) =>
    (await call('GET', path, {params: {search: term, pageSize: MAX_PAGE_SIZE}}))
      .items;
  const deleteUser = id => call('DELETE', `/users/${id}`);
  const deleteRole = id => call('DELETE', `/roles/${id}`);

  const removeMatching = async term => {
    const [users, roles] = await Promise.all([
      search('/users', term),
      search('/roles', term),
    ]);
    const ownUsers = users.filter(user => user.email.startsWith(NAME_PREFIX));
    const ownRoles = roles.filter(role => role.slug.startsWith(NAME_PREFIX));
    await Promise.all(ownUsers.map(user => deleteUser(user.id)));
    await Promise.all(ownRoles.map(role => deleteRole(role.id)));
    return {
      users: ownUsers.map(user => user.email),
      roles: ownRoles.map(role => role.slug),
    };
  };

  return {
    async createUser({email, password = 'e2e-parola-1', roleIds, disabledAt}) {
      const {id} = await call('POST', '/users', {
        data: {email, password, roleIds, disabledAt},
      });
      return {id, email, password};
    },
    async updateUser(id, values) {
      await call('PATCH', `/users/${id}`, {data: values});
    },
    deleteUser,
    async findUser(email) {
      return (
        (await search('/users', email)).find(user => user.email === email) ??
        null
      );
    },
    async createRole({name, permissions, anchorRoleId, placement}) {
      const {id} = await call('POST', '/roles', {
        data: {slug: name, label: name, permissions, anchorRoleId, placement},
      });
      return {id, slug: name, label: name};
    },
    async updateRole(id, values) {
      await call('PATCH', `/roles/${id}`, {data: values});
    },
    deleteRole,
    async findRole(slug) {
      return (
        (await search('/roles', slug)).find(role => role.slug === slug) ?? null
      );
    },
    readSettings: () => call('GET', '/settings'),
    updateSettings: values => call('PATCH', '/settings', {data: values}),
    cleanup: () => removeMatching(getTestKey(testInfo)),
    sweep: () => removeMatching(NAME_PREFIX),
  };
}

export const backendFixtures = {
  backend: [
    async ({request}, use, testInfo) => {
      const backend = await openBackend(request, testInfo);
      await use(backend);
      await backend.cleanup();
    },
    {scope: 'test', auto: true},
  ],
  adminRole: [
    async ({backend}, use) => use(await backend.findRole(ADMIN_ROLE_SLUG)),
    {scope: 'test'},
  ],
};

export const accountFixtures = {
  account: [
    async ({backend, adminRole}, use, testInfo) => {
      const role = await backend.createRole({
        name: uniqueName(testInfo, 'account'),
        permissions: [Permission.ADMIN],
        anchorRoleId: adminRole.id,
      });
      const user = await backend.createUser({
        email: uniqueEmail(testInfo, 'account'),
        roleIds: [role.id],
      });
      await use({...user, roleId: role.id});
    },
    {scope: 'test'},
  ],
  storageState: [
    async ({request, baseURL, account}, use) => {
      const tokens = await signIn(request, account);
      await use(getSessionStorageState(baseURL, toPersistedSession(tokens)));
    },
    {scope: 'test'},
  ],
};
