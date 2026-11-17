'use client';

import {
  CalendarDate,
  ClockTime,
  DateTime,
  Duration,
} from '@/components/common/date-time';
import {useIsClient} from '@/hooks/use-is-client';

const INSTANT = '2024-06-03T10:04:05Z';

const SAMPLES = [
  {label: 'Tarih ve saat', element: <DateTime value={INSTANT} />},
  {label: 'Tarih', element: <CalendarDate value={INSTANT} />},
  {label: 'Saat', element: <ClockTime value={INSTANT} />},
  {label: 'Saat yok', element: <ClockTime value={null} />},
  {label: 'Kısa süre', element: <Duration milliseconds={250} />},
  {label: 'Neredeyse saniye', element: <Duration milliseconds={999.6} />},
  {label: 'Saniyeler', element: <Duration milliseconds={45_400} />},
  {label: 'Saatler', element: <Duration milliseconds={3_723_000} />},
  {label: 'Günler', element: <Duration milliseconds={183_600_000} />},
  {label: 'Ters süre', element: <Duration milliseconds={-5000} />},
  {label: 'Süre yok', element: <Duration milliseconds={null} />},
];

export function DateTimeFixture() {
  const isClient = useIsClient();

  return (
    <ul className="flex flex-col gap-2">
      {SAMPLES.map(({label, element}) => (
        <li key={label} role="group" aria-label={label}>
          {isClient && element}
        </li>
      ))}
    </ul>
  );
}
