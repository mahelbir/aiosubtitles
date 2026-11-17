'use client';

import {useSyncExternalStore} from 'react';
import {useIsomorphicLayoutEffect} from '@reactuses/core';
import {APP_NAME, TITLE_SUFFIX} from '@/config/app';

let listeners = null;
let observer = null;
let snapshot = null;
let desired = null;
let holders = 0;

function readTitle() {
  const {title} = document;
  if (title.endsWith(TITLE_SUFFIX)) {
    return title.slice(0, -TITLE_SUFFIX.length);
  }
  return title === APP_NAME ? null : title;
}

/* On dynamic routes Next streams metadata after hydration and overwrites the title;
 the observer catches that and restores the requested value. HTML source keeps metadata. */
function handleMutation() {
  if (desired !== null && document.title !== desired) {
    document.title = desired;
    return;
  }
  const next = readTitle();
  if (next === snapshot) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

function retain() {
  if (!observer) {
    listeners = new Set();
    snapshot = readTitle();
    observer = new MutationObserver(handleMutation);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
  holders += 1;
  return () => {
    holders -= 1;
    if (!holders) {
      observer.disconnect();
      observer = null;
      listeners = null;
    }
  };
}

function subscribe(onStoreChange) {
  const release = retain();
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    release();
  };
}

function getSnapshot() {
  return observer ? snapshot : readTitle();
}

function getServerSnapshot() {
  return null;
}

export function useDocumentTitle(title) {
  useIsomorphicLayoutEffect(() => {
    if (!title) {
      return undefined;
    }
    desired = `${title}${TITLE_SUFFIX}`;
    document.title = desired;
    const release = retain();
    return () => {
      desired = null;
      release();
    };
  }, [title]);

  return useSyncExternalStore(
    subscribe,
    () => title || getSnapshot(),
    () => title || getServerSnapshot(),
  );
}
