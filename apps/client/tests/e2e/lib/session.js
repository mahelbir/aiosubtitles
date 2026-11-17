import * as path from 'node:path';

const AUTH_STORAGE_KEY = 'auth';

export const ADMIN_STORAGE_STATE_PATH = path.join(
  import.meta.dirname,
  '../.auth/admin.json',
);

export function readPersistedSession(page) {
  return page.evaluate(
    key => JSON.parse(localStorage.getItem(key))?.state ?? null,
    AUTH_STORAGE_KEY,
  );
}

function toStoredSession(session) {
  return JSON.stringify({state: session, version: 1});
}

export function writePersistedSession(page, session) {
  return page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [AUTH_STORAGE_KEY, toStoredSession(session)],
  );
}

export function toPersistedSession({accessToken, refreshToken, expiresIn}) {
  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    principal: null,
  };
}

export function getSessionStorageState(baseURL, session) {
  return {
    cookies: [],
    origins: [
      {
        origin: new URL(baseURL).origin,
        localStorage: [
          {name: AUTH_STORAGE_KEY, value: toStoredSession(session)},
        ],
      },
    ],
  };
}

export function getSessionStorageStateFixture(session) {
  return [
    async ({baseURL}, use) => use(getSessionStorageState(baseURL, session)),
    {scope: 'test'},
  ];
}
