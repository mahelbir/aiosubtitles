'use client';

import {useDebounce} from '@reactuses/core';
import {OfflineNotice} from '@/components/common/offline-notice';
import {useIsOnline} from '@/hooks/use-is-online';

const OFFLINE_DEBOUNCE_MS = 800;

export function OfflineBanner() {
  const isOnline = useIsOnline();
  const isOffline = useDebounce(!isOnline, OFFLINE_DEBOUNCE_MS);

  if (!isOffline) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed start-6 bottom-safe z-50 rounded-lg border bg-background px-3 py-2 text-sm shadow-lg"
    >
      <OfflineNotice
        message="Bağlantı yok. Çevrimiçi olunca güncellenecek."
        className="text-foreground [&_svg]:text-warning"
      />
    </div>
  );
}
