'use client';

import {AppThemeProvider} from '@/components/common/app-theme-provider';

export function LandingProvider({children}) {
  return (
    <AppThemeProvider storageKey="landing-theme">{children}</AppThemeProvider>
  );
}
