import {getTestApp, getTestAppBasePath} from './app.js';

export const USER_CONFIGS_URL = '/api/user-configs';

export async function callUserConfigApi({method, url, payload, sessionToken}) {
  const app = await getTestApp();
  return app.inject({
    method,
    url: getTestAppBasePath() + url,
    payload,
    headers: sessionToken ? {authorization: `Bearer ${sessionToken}`} : {},
  });
}

export function login(userConfigId, password) {
  return callUserConfigApi({
    method: 'POST',
    url: `${USER_CONFIGS_URL}/${userConfigId}/sessions`,
    payload: {password},
  });
}
