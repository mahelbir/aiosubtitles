'use client';

import {hasBlockingError} from '@/lib/query';
import {Button} from '@/components/ui/button';
import {ErrorAlert} from '@/components/common/status-alerts';
import {OfflineEmpty} from '@/components/common/offline-notice';
import {PageLoader} from '@/components/common/page-loader';

export function QueryErrorAlert({query}) {
  return (
    <ErrorAlert
      actions={
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          Yeniden dene
        </Button>
      }
    >
      {query.error.message}
    </ErrorAlert>
  );
}

export function QueryBoundary({query, pending, className, children}) {
  let state;
  if (hasBlockingError(query)) {
    state = <QueryErrorAlert query={query} />;
  } else if (query.isPending && query.fetchStatus === 'paused') {
    state = <OfflineEmpty className="min-h-64" />;
  } else if (query.isPending) {
    if (pending !== undefined) {
      return pending;
    }
    state = <PageLoader />;
  } else {
    return children(query.data);
  }
  return className ? <div className={className}>{state}</div> : state;
}
