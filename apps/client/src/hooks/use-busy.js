'use client';

import {useEffect} from 'react';
import {useBusyStore} from '@/stores/busy-store';

export function useBusy(active) {
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const {begin, end} = useBusyStore.getState();
    begin();
    return () => {
      end();
    };
  }, [active]);
}
