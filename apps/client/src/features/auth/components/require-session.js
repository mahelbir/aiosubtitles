'use client';

import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {toast} from 'react-toastify';
import {withQuery} from '@repo/shared/lib/url-query.js';
import {useAuthStore} from '@/stores/auth-store';
import {FullscreenSpinner} from '@/components/common/fullscreen-spinner';
import {ErrorPage} from '@/components/common/error-page';
import {Button} from '@/components/ui/button';
import {refreshPrincipal} from '@/api/principal';

export function RequireSession({loginRoute, children}) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [meError, setMeError] = useState(null);
  const hasHydrated = useAuthStore(state => state._hasHydrated);
  const accessToken = useAuthStore(state => state.accessToken);
  const principal = useAuthStore(state => state.principal);

  useEffect(() => {
    if (!hasHydrated || accessToken) {
      return;
    }
    const {sessionExpired, ackSessionExpired} = useAuthStore.getState();
    if (sessionExpired) {
      toast.error('Oturumunuz sona erdi.');
      ackSessionExpired();
    }
    const {pathname, search, hash} = window.location;
    router.replace(withQuery(loginRoute, {next: pathname + search + hash}));
  }, [hasHydrated, accessToken, loginRoute, router]);

  useEffect(() => {
    if (!hasHydrated || !accessToken) {
      return;
    }
    refreshPrincipal()
      .then(() => setMeError(null))
      .catch(setMeError);
  }, [hasHydrated, accessToken, attempt]);

  if (!hasHydrated || !accessToken) {
    return <FullscreenSpinner />;
  }

  if (!principal && meError) {
    return (
      <ErrorPage
        title="Bağlantı kurulamadı"
        message={meError.message}
        actions={
          <Button onClick={() => setAttempt(count => count + 1)}>
            Yeniden dene
          </Button>
        }
      />
    );
  }

  return children;
}
