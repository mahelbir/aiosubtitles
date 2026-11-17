'use client';

import {useAutoAnimate} from '@/hooks/use-auto-animate';
import {MonitorCard} from './monitor-card';

export function MonitorStream({cards, onClearCard}) {
  const gridRef = useAutoAnimate();

  return (
    <div className="@container">
      {!cards.length && (
        <p className="my-12 text-center text-muted-foreground">Hiç veri yok.</p>
      )}
      <div ref={gridRef} className="grid items-start gap-4 @3xl:grid-cols-2">
        {cards.map(card => (
          <MonitorCard
            key={card.key}
            card={card}
            onClear={() => onClearCard(card.key)}
          />
        ))}
      </div>
    </div>
  );
}
