'use client';

import dynamic from 'next/dynamic';
import {QueryClientProvider} from '@tanstack/react-query';
import {MotionConfig, useReducedMotion} from 'motion/react';
import {NuqsAdapter} from 'nuqs/adapters/next/app';
import {configureZodLocale} from '@repo/shared/lib/locale.js';
import {env} from '@/config/env';
import {getQueryClient} from '@/lib/query-client';
import {TopLoader} from '@/components/common/top-loader';
import {TooltipProvider} from '@/components/ui/tooltip';
import {OfflineBanner} from '@/components/common/offline-banner';
import {AppThemeProvider} from '@/components/common/app-theme-provider';
import {AppToastContainer} from '@/components/common/app-toast-container';

const AppAlertContainer = dynamic(
  () =>
    import('@/components/common/app-alert-container').then(
      module => module.AppAlertContainer,
    ),
  {ssr: false},
);

configureZodLocale(env.LOCALE);

export function AppProviders({themeStorageKey, children}) {
  const shouldReduceMotion = useReducedMotion() ?? false;

  return (
    <AppThemeProvider storageKey={themeStorageKey}>
      <NuqsAdapter>
        <QueryClientProvider client={getQueryClient()}>
          <TooltipProvider>
            <MotionConfig
              reducedMotion="user"
              skipAnimations={shouldReduceMotion}
            >
              <TopLoader />
              {children}
              <AppAlertContainer />
              <OfflineBanner />
              <AppToastContainer />
            </MotionConfig>
          </TooltipProvider>
        </QueryClientProvider>
      </NuqsAdapter>
    </AppThemeProvider>
  );
}
