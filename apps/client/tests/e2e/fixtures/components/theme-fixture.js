'use client';

import {useTheme} from 'next-themes';
import {ThemeModeToggle} from '@/components/layout/admin/theme-mode-toggle';
import {useIsClient} from '@/hooks/use-is-client';
import {FixtureState} from './fixture-state';

export function ThemeFixture() {
  const isClient = useIsClient();
  const {theme, resolvedTheme, systemTheme} = useTheme();

  return (
    <>
      <div>
        <ThemeModeToggle />
      </div>
      <FixtureState
        value={isClient ? {theme, resolvedTheme, systemTheme} : null}
      />
    </>
  );
}
