'use client';

import {useSyncExternalStore} from 'react';
import {onlineManager} from '@tanstack/react-query';

const subscribe = listener => onlineManager.subscribe(listener);
const getSnapshot = () => onlineManager.isOnline();
const getServerSnapshot = () => true;

export function useIsOnline() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
