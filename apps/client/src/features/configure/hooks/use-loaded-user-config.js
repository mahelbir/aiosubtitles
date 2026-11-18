'use client';

import {createContext, use} from 'react';

export const LoadedUserConfigContext = createContext(null);

export function useLoadedUserConfig() {
  return use(LoadedUserConfigContext);
}
