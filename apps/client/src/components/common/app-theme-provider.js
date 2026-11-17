'use client';

import {ThemeProvider} from 'next-themes';
import {APP_THEME} from '@/config/theme';
import {ThemeColorMeta} from '@/components/common/theme-color-meta';

const APP_THEMES = [APP_THEME];

export function AppThemeProvider({children}) {
  return (
    <ThemeProvider
      attribute="class"
      themes={APP_THEMES}
      defaultTheme={APP_THEME}
      forcedTheme={APP_THEME}
      enableSystem={false}
      disableTransitionOnChange
    >
      <ThemeColorMeta />
      {children}
    </ThemeProvider>
  );
}
