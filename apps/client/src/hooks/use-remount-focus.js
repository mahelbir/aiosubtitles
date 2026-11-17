'use client';

import {useState} from 'react';

export function useRemountFocus() {
  const [isFocused, setIsFocused] = useState(false);

  return {
    autoFocus: isFocused,
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
  };
}
