'use client';

import {createContext, use} from 'react';

export const SettingsLayoutContext = createContext(null);

export function useSettingsLayout() {
  return use(SettingsLayoutContext);
}
