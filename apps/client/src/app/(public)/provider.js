'use client';

import {PUBLIC_THEME_KEY} from '@/config/theme';
import {AppProviders} from '@/components/common/app-providers';

export function PublicProvider({children}) {
  return (
    <AppProviders themeStorageKey={PUBLIC_THEME_KEY}>{children}</AppProviders>
  );
}
