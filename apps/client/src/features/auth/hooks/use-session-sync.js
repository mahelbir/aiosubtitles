'use client';

import {useEffect} from 'react';
import {useEventListener} from '@reactuses/core';
import {syncAuthStorage, useAuthStore} from '@/stores/auth-store';

export function useSessionSync(queryClient) {
  useEventListener('storage', syncAuthStorage);

  useEffect(() => {
    const unsubscribe = useAuthStore.subscribe((state, previous) => {
      if (
        previous.refreshToken &&
        state.refreshToken !== previous.refreshToken
      ) {
        queryClient.clear();
      }
    });
    useAuthStore.persist.rehydrate();
    return unsubscribe;
  }, [queryClient]);
}
