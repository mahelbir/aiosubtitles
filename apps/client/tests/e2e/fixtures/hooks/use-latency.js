'use client';

import {useSearchParams} from 'next/navigation';

export function useLatency() {
  return Number(useSearchParams().get('delay') ?? 0);
}
