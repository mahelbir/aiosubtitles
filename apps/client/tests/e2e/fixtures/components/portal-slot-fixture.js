'use client';

import {createContext, use, useState} from 'react';
import {
  PortalSlot,
  PortalSlotContent,
  PortalSlotProvider,
} from '@/components/common/portal-slot';
import {Button} from '@/components/ui/button';
import {FixtureSection} from './fixture-section';

const SourceContext = createContext(null);

export function PortalSlotFixture() {
  return (
    <>
      <FixtureSection title="Yuva ile">
        <PortalSlotProvider>
          <SlotCard hasSlot />
        </PortalSlotProvider>
      </FixtureSection>
      <FixtureSection title="Yuva olmadan">
        <SlotCard />
      </FixtureSection>
      <FixtureSection title="Yuva devri">
        <SlotHandover />
      </FixtureSection>
    </>
  );
}

function SlotHandover() {
  const [isFirstShown, setIsFirstShown] = useState(true);

  return (
    <PortalSlotProvider>
      {isFirstShown && (
        <div role="group" aria-label="İlk yuva">
          <PortalSlot />
        </div>
      )}
      <div role="group" aria-label="Son yuva">
        <PortalSlot />
      </div>
      <Button variant="outline" onClick={() => setIsFirstShown(false)}>
        İlk yuvayı kaldır
      </Button>
      <SourceContext value="Devir">
        <CounterAction />
      </SourceContext>
    </PortalSlotProvider>
  );
}

function SlotCard({hasSlot = false}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div
        role="group"
        aria-label="Kart başlığı"
        className="flex items-center justify-between gap-2"
      >
        <span className="font-medium">Başlık</span>
        {hasSlot && <PortalSlot />}
      </div>
      <div role="group" aria-label="Kart gövdesi">
        <SourceContext value="Gövde">
          <CounterAction />
        </SourceContext>
      </div>
    </div>
  );
}

function CounterAction() {
  const source = use(SourceContext);
  const [count, setCount] = useState(0);

  return (
    <PortalSlotContent>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setCount(current => current + 1)}
      >
        {source}: {count}
      </Button>
    </PortalSlotContent>
  );
}
