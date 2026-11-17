'use client';

import {WifiOffIcon} from 'lucide-react';
import {cn} from 'cn';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from '@/components/ui/empty';

const OFFLINE_MESSAGE = 'Bağlantı yok. Çevrimiçi olunca yüklenecek.';

export function OfflineNotice({message = OFFLINE_MESSAGE, className}) {
  return (
    <span
      className={cn(
        'flex items-center justify-center gap-2 text-muted-foreground',
        className,
      )}
    >
      <WifiOffIcon className="size-4" />
      {message}
    </span>
  );
}

export function OfflineEmpty({message = OFFLINE_MESSAGE, className}) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <WifiOffIcon />
        </EmptyMedia>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
