'use client';

import {useQueryClient} from '@tanstack/react-query';
import {StatusCodes} from 'http-status-codes';
import {Button} from '@/components/ui/button';
import {ErrorPage} from '@/components/common/error-page';
import {useIsOnline} from '@/hooks/use-is-online';

export function AppError({retry}) {
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();

  const handleRetry = () => {
    queryClient.resetQueries({type: 'inactive'});
    retry();
  };

  return (
    <ErrorPage
      code={
        isOnline
          ? StatusCodes.INTERNAL_SERVER_ERROR
          : StatusCodes.SERVICE_UNAVAILABLE
      }
      title={isOnline ? 'Hay aksi!' : 'Bağlantı yok'}
      message={
        isOnline
          ? 'Beklenmeyen bir hata oluştu.'
          : 'Bu sayfa yüklenemedi. Çevrimiçi olunca tekrar deneyin.'
      }
      actions={
        <Button variant="secondary" onClick={handleRetry}>
          Tekrar dene
        </Button>
      }
    />
  );
}
