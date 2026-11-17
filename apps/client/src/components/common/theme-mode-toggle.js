'use client';

import {useTheme} from 'next-themes';
import {MoonIcon, SunIcon} from 'lucide-react';
import {TooltipIconButton} from '@/components/common/icon-button';

export function ThemeModeToggle() {
  const {resolvedTheme, setTheme} = useTheme();

  return (
    <TooltipIconButton
      variant="secondary"
      size="icon"
      title="Temayı değiştir"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="block dark:hidden" />
    </TooltipIconButton>
  );
}
