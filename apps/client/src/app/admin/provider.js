'use client';

import {ADMIN_THEME_KEY} from '@/config/theme';
import {getQueryClient} from '@/lib/query-client';
import {useSessionSync} from '@/features/auth/hooks/use-session-sync';
import {AppProviders} from '@/components/common/app-providers';

export function AdminProvider({children}) {
  useSessionSync(getQueryClient());

  return (
    <AppProviders themeStorageKey={ADMIN_THEME_KEY}>{children}</AppProviders>
  );
}
