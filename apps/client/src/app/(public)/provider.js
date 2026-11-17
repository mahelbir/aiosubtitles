'use client';

import {AppProviders} from '@/components/common/app-providers';

export function PublicProvider({children}) {
  return <AppProviders>{children}</AppProviders>;
}
