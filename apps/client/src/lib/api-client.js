import {attemptAsync} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {withApiQuery} from '@repo/shared/lib/url-query.js';
import {env} from '@/config/env';
import {ApiError, requestApi} from '@/lib/api-request';
import {useAuthStore} from '@/stores/auth-store';

const EXPIRY_MARGIN_MS = 30000;

let refreshPromise = null;

function rawRequest(path, options) {
  return requestApi(env.API_URL, path, options);
}

async function requestRefresh(refreshToken) {
  if (!refreshToken) {
    throw new ApiError('Oturum bulunamadı.', {
      status: StatusCodes.UNAUTHORIZED,
    });
  }
  return rawRequest('/auth/refresh', {method: 'POST', body: {refreshToken}});
}

function refreshSession() {
  refreshPromise ??= (async () => {
    const {refreshToken} = useAuthStore.getState();
    const [error, data] = await attemptAsync(() =>
      requestRefresh(refreshToken),
    );
    const {applyRefresh, expireSession, isCurrentSession} =
      useAuthStore.getState();
    if (!error) {
      applyRefresh(refreshToken, data);
      return;
    }
    if (isCurrentSession(refreshToken)) {
      if (!error.isTransient) {
        expireSession(refreshToken);
      }
      throw error;
    }
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

function isExpired({accessToken, expiresAt}, marginMs = 0) {
  return (
    Boolean(accessToken && expiresAt) && Date.now() >= expiresAt - marginMs
  );
}

async function freshSession() {
  const session = useAuthStore.getState();
  if (!isExpired(session, EXPIRY_MARGIN_MS)) {
    return session;
  }
  const [error] = await attemptAsync(refreshSession);
  const current = useAuthStore.getState();
  if (error && (!error.isTransient || isExpired(current))) {
    throw error;
  }
  return current;
}

export async function ensureFreshToken() {
  const {accessToken} = await freshSession();
  return accessToken;
}

async function sendRequest(path, options) {
  const {_retry, query, ...requestOptions} = options;
  const url = withApiQuery(path, query);
  const {accessToken: token, refreshToken} = await freshSession();
  try {
    return await rawRequest(url, {...requestOptions, token});
  } catch (error) {
    const isAuthError =
      error instanceof ApiError &&
      error.status === StatusCodes.UNAUTHORIZED &&
      Boolean(token);
    if (isAuthError && _retry) {
      useAuthStore.getState().expireSession(refreshToken);
    }
    if (!isAuthError || _retry) {
      throw error;
    }
    await refreshSession();
    return sendRequest(url, {...requestOptions, _retry: true});
  }
}

export function apiData(path, options = {}) {
  return sendRequest(path, options);
}

export function apiEnvelope(path, options = {}) {
  return sendRequest(path, {...options, envelope: true});
}
