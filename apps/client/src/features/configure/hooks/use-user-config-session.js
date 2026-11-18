'use client';

import {useSyncExternalStore} from 'react';
import {
  readUserConfigSessionNotice,
  readUserConfigSessionToken,
  subscribeUserConfigSession,
} from '../lib/user-config-session';

const getUnknownSnapshot = () => undefined;

export function useUserConfigSessionToken(userConfigId) {
  return useSyncExternalStore(
    subscribeUserConfigSession,
    () => readUserConfigSessionToken(userConfigId),
    getUnknownSnapshot,
  );
}

export function useUserConfigSessionNotice(userConfigId) {
  return useSyncExternalStore(
    subscribeUserConfigSession,
    () => readUserConfigSessionNotice(userConfigId),
    () => null,
  );
}
