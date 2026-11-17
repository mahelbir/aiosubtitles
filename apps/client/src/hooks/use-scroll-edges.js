'use client';

import {useSyncExternalStore} from 'react';
import {debounce} from 'es-toolkit';

const EDGE_THRESHOLD = 4;
const MEASURE_DEBOUNCE_MS = 150;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const INITIAL = {isReady: false, isAtTop: true, isAtBottom: true};

const listeners = new Set();
let snapshot = INITIAL;
let observer = null;

const measure = debounce(() => {
  const root = document.documentElement;
  const isAtTop = window.scrollY <= EDGE_THRESHOLD;
  const isAtBottom =
    window.scrollY + window.innerHeight >= root.scrollHeight - EDGE_THRESHOLD;
  if (
    snapshot.isReady &&
    snapshot.isAtTop === isAtTop &&
    snapshot.isAtBottom === isAtBottom
  ) {
    return;
  }
  snapshot = {isReady: true, isAtTop, isAtBottom};
  for (const listener of listeners) {
    listener();
  }
}, MEASURE_DEBOUNCE_MS);

function subscribe(onStoreChange) {
  if (!observer) {
    observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    window.addEventListener('scroll', measure, {passive: true});
  }
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size) {
      return;
    }
    measure.cancel();
    window.removeEventListener('scroll', measure);
    observer.disconnect();
    observer = null;
    snapshot = INITIAL;
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return INITIAL;
}

function scrollBehavior() {
  return window.matchMedia(REDUCED_MOTION).matches ? 'auto' : 'smooth';
}

function scrollToTop() {
  window.scrollTo({top: 0, behavior: scrollBehavior()});
}

function scrollToBottom() {
  window.scrollTo({
    top: document.documentElement.scrollHeight,
    behavior: scrollBehavior(),
  });
}

export function useScrollEdges() {
  return {
    ...useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot),
    scrollToTop,
    scrollToBottom,
  };
}
