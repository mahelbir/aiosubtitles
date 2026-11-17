'use client';

import {useEffect} from 'react';

let holders = 0;
let warn = null;

function retain() {
  holders += 1;
  if (!warn) {
    warn = event => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
  }
  return () => {
    holders -= 1;
    if (holders > 0) {
      return;
    }
    window.removeEventListener('beforeunload', warn);
    warn = null;
  };
}

export function useUnsavedChanges(isUnsaved) {
  useEffect(() => {
    if (!isUnsaved) {
      return;
    }
    return retain();
  }, [isUnsaved]);
}
