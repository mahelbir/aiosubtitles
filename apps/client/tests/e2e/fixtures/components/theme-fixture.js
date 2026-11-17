'use client';

import {useTheme} from 'next-themes';
import {useIsClient} from '@/hooks/use-is-client';
import {FixtureState} from './fixture-state';

export function ThemeFixture() {
  const isClient = useIsClient();
  const {forcedTheme, themes} = useTheme();

  return <FixtureState value={isClient ? {forcedTheme, themes} : null} />;
}
