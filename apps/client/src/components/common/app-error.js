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
      title={isOnline ? 'Oops!' : 'No connection'}
      message={
        isOnline
          ? 'An unexpected error occurred.'
          : 'This page could not load. Try again when you are online.'
      }
      actions={
        <Button variant="secondary" onClick={handleRetry}>
          Try again
        </Button>
      }
    />
  );
}
