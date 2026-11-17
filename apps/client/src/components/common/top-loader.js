'use client';

import {useIsFetching, useIsMutating} from '@tanstack/react-query';
import {unwrapDefault} from 'melperjs';
import * as nextTopLoader from 'nextjs-toploader';
import {useBusyStore} from '@/stores/busy-store';

const NextTopLoader = unwrapDefault(nextTopLoader);

const FOREGROUND_FETCH = {
  predicate: query =>
    // silent background fetches
    query.state.data === undefined && query.meta?.hasIndicator !== false,
};

const FOREGROUND_MUTATION = {
  predicate: mutation => mutation.meta?.hasIndicator !== false,
};

function FetchIndicator() {
  const fetching = useIsFetching(FOREGROUND_FETCH);
  const mutating = useIsMutating(FOREGROUND_MUTATION);
  const busy = useBusyStore(state => state.count);

  if (!fetching && !mutating && !busy) {
    return null;
  }
  return <div className="fetch-indicator" />;
}

export function TopLoader() {
  return (
    <>
      <NextTopLoader color="var(--primary)" showSpinner={false} />
      <FetchIndicator />
    </>
  );
}
