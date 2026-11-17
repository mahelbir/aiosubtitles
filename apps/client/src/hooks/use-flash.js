'use client';

import {useCallback, useState} from 'react';
import {useTimeoutFn} from '@reactuses/core';

const DEFAULT_DURATION = 400;

export function useFlash(duration = DEFAULT_DURATION) {
  const [flashedId, setFlashedId] = useState(null);
  const [, start] = useTimeoutFn(() => setFlashedId(null), duration, {
    immediate: false,
  });

  const flash = useCallback(
    id => {
      setFlashedId(id);
      start();
    },
    [start],
  );

  return {flashedId, flash};
}
