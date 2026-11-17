'use client';

import {useEffect} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {useAuthStore} from '@/stores/auth-store';
import {FullscreenSpinner} from '@/components/common/fullscreen-spinner';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {APP_NAME} from '@/config/app';
import {LoginForm} from './login-form';

const INTERNAL_ORIGIN = 'http://internal';

function resolveNext(value, fallback) {
  if (!value || !URL.canParse(value, INTERNAL_ORIGIN)) {
    return fallback;
  }
  const url = new URL(value, INTERNAL_ORIGIN);
  const target = url.pathname + url.search + url.hash;
  if (
    url.origin !== INTERNAL_ORIGIN ||
    target.startsWith('//') ||
    target.includes('\\')
  ) {
    return fallback;
  }
  return target;
}

export function LoginPage({nextRoute = '/'}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasHydrated = useAuthStore(state => state._hasHydrated);
  const accessToken = useAuthStore(state => state.accessToken);
  nextRoute = resolveNext(searchParams.get('next'), nextRoute);

  useEffect(() => {
    if (hasHydrated && accessToken) {
      router.replace(nextRoute);
    }
  }, [hasHydrated, accessToken, router, nextRoute]);

  if (!hasHydrated || accessToken) {
    return <FullscreenSpinner />;
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted p-6">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader className="text-center">
            <CardTitle size="lg">{APP_NAME}</CardTitle>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
