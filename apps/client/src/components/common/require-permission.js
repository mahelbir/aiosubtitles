'use client';

import {useAuthorization} from '@/hooks/use-authorization';

export function RequirePermission({fallback = null, children, ...criteria}) {
  const {can} = useAuthorization();

  return can(criteria) ? children : fallback;
}
