'use client';

import {useCallback} from 'react';
import {useSidebar} from '@/components/ui/sidebar';

export function useCloseMobileSidebar() {
  const {setOpenMobile} = useSidebar();

  return useCallback(() => {
    setOpenMobile(false);
  }, [setOpenMobile]);
}
