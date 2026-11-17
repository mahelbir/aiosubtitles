'use client';

import {ThemeProvider} from 'next-themes';
import {ThemeColorMeta} from '@/components/common/theme-color-meta';

export function AppThemeProvider({children, ...props}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      <ThemeColorMeta />
      {children}
    </ThemeProvider>
  );
}
