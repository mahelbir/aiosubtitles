'use client';

import {useNow} from '@/hooks/use-now';
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatRelativeTime,
  formatTime,
  toDate,
  toIsoDuration,
} from '@/lib/datetime';

export function DateTime(props) {
  return <FormattedTime {...props} format={formatDateTime} />;
}

export function CalendarDate(props) {
  return <FormattedTime {...props} format={formatDate} />;
}

export function ClockTime(props) {
  return <FormattedTime {...props} format={formatTime} />;
}

export function RelativeTime(props) {
  const now = useNow();
  return (
    <FormattedTime
      {...props}
      format={date =>
        now === null ? formatDateTime(date) : formatRelativeTime(date, {now})
      }
    />
  );
}

export function Duration({milliseconds, ...props}) {
  if (!Number.isFinite(milliseconds)) {
    return null;
  }
  return (
    <time
      {...props}
      dateTime={toIsoDuration(milliseconds)}
      suppressHydrationWarning
    >
      {formatDuration(milliseconds)}
    </time>
  );
}

function FormattedTime({value, unix, format, ...props}) {
  const date = toDate(value, unix);
  if (!date) {
    return null;
  }
  return (
    <time {...props} dateTime={date.toISOString()} suppressHydrationWarning>
      {format(date)}
    </time>
  );
}
