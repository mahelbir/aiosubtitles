import {attempt} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {ErrorCode} from '@repo/shared/constants/error-code.js';
import {ApiError} from '@/lib/api-request';

const SESSION_STORAGE_KEY_PREFIX = 'aiosubtitles-user-config-session:';

const MISSING_SESSION_MESSAGE = 'Enter your password to continue.';

const memoryTokens = new Map();

const sessionNotices = new Map();

const listeners = new Set();

function getSessionStorageKey(userConfigId) {
  return `${SESSION_STORAGE_KEY_PREFIX}${userConfigId}`;
}

function accessSessionStorage(access) {
  return attempt(() => access(window.sessionStorage));
}

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeUserConfigSession(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readUserConfigSessionToken(userConfigId) {
  if (!userConfigId) {
    return null;
  }
  if (!memoryTokens.has(userConfigId)) {
    const [, storedToken] = accessSessionStorage(sessionStorage =>
      sessionStorage.getItem(getSessionStorageKey(userConfigId)),
    );
    memoryTokens.set(userConfigId, storedToken ?? null);
  }
  return memoryTokens.get(userConfigId);
}

export function writeUserConfigSessionToken(userConfigId, sessionToken) {
  memoryTokens.set(userConfigId, sessionToken);
  sessionNotices.delete(userConfigId);
  accessSessionStorage(sessionStorage =>
    sessionStorage.setItem(getSessionStorageKey(userConfigId), sessionToken),
  );
  notify();
}

export function clearUserConfigSessionToken(userConfigId) {
  memoryTokens.set(userConfigId, null);
  accessSessionStorage(sessionStorage =>
    sessionStorage.removeItem(getSessionStorageKey(userConfigId)),
  );
  notify();
}

export function readUserConfigSessionNotice(userConfigId) {
  return sessionNotices.get(userConfigId) ?? null;
}

export function isUserConfigSessionExpired(error) {
  return error?.errorCode === ErrorCode.SESSION_EXPIRED;
}

export async function requestWithUserConfigSession(userConfigId, request) {
  const sessionToken = readUserConfigSessionToken(userConfigId);
  if (!sessionToken) {
    throw new ApiError(
      readUserConfigSessionNotice(userConfigId) ?? MISSING_SESSION_MESSAGE,
      {
        status: StatusCodes.UNAUTHORIZED,
        errorCode: ErrorCode.SESSION_EXPIRED,
      },
    );
  }
  try {
    return await request(sessionToken);
  } catch (error) {
    if (
      isUserConfigSessionExpired(error) &&
      readUserConfigSessionToken(userConfigId) === sessionToken
    ) {
      sessionNotices.set(userConfigId, error.message);
      clearUserConfigSessionToken(userConfigId);
    }
    throw error;
  }
}
