'use client';

import {useSyncExternalStore} from 'react';
import {noop} from 'es-toolkit';

const subscribe = () => noop;

export function useIsClient() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
