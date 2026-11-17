'use client';

import {useSyncExternalStore} from 'react';

const listeners = new Set();
let now = Date.now();
let timer = null;

function tick() {
  now = Date.now();
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener) {
  if (listeners.size === 0) {
    now = Date.now();
    timer = setInterval(tick, 10_000);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
    }
  };
}

const getSnapshot = () => now;
const getServerSnapshot = () => null;

export function useNow() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
