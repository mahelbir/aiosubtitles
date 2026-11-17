'use client';

import {useEffect, useRef} from 'react';
import {toast} from 'react-toastify';
import {StatusCodes} from 'http-status-codes';
import {EntityNotFound} from '@/components/common/entity-not-found';
import {QueryBoundary} from '@/components/common/query-boundary';

const MISSING_STATUSES = new Set([
  StatusCodes.NOT_FOUND,
  StatusCodes.UNPROCESSABLE_ENTITY,
]);

function EntityBoundary({
  id,
  query,
  onMissing,
  missing = null,
  children,
  ...props
}) {
  const {error} = query;
  const isMissing = MISSING_STATUSES.has(error?.status);
  const onMissingRef = useRef(onMissing);

  useEffect(() => {
    onMissingRef.current = onMissing;
  });

  useEffect(() => {
    if (isMissing) {
      onMissingRef.current?.(error);
    }
  }, [isMissing, error]);

  if (!id) {
    return children(null);
  }

  if (isMissing) {
    return missing;
  }

  return (
    <QueryBoundary query={query} {...props}>
      {children}
    </QueryBoundary>
  );
}

export function PanelEntityBoundary({onClose, ...props}) {
  return (
    <EntityBoundary
      onMissing={error => {
        toast.error(error.message);
        onClose?.();
      }}
      {...props}
    />
  );
}

export function PageEntityBoundary({back, ...props}) {
  return <EntityBoundary missing={<EntityNotFound back={back} />} {...props} />;
}
