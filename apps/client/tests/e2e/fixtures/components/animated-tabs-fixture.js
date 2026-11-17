'use client';

import {useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {ArchiveIcon, InboxIcon} from 'lucide-react';
import {
  AnimatedTabs,
  AnimatedTabsList,
  AnimatedTabsPanels,
} from '@/components/common/animated-tabs';
import {Button} from '@/components/ui/button';
import {FixtureSection} from './fixture-section';
import {FixtureState} from './fixture-state';

const PERIOD_ITEMS = [
  {value: 'daily', label: 'Günlük'},
  {value: 'weekly', label: 'Haftalık'},
];

export function AnimatedTabsFixture() {
  const initialValue = useSearchParams().get('value') ?? 'inbox';
  const [value, setValue] = useState(initialValue);
  const [changes, setChanges] = useState([]);
  const [count, setCount] = useState(2);
  const [archiveCount, setArchiveCount] = useState(null);
  const [period, setPeriod] = useState('daily');
  const items = [
    {value: 'inbox', label: 'Gelen', icon: InboxIcon, badge: count},
    {value: 'archive', label: 'Arşiv', icon: ArchiveIcon, badge: archiveCount},
    {value: 'drafts', label: 'Taslaklar'},
    {value: 'spam', label: 'İstenmeyen', disabled: true},
  ];

  return (
    <>
      <FixtureSection title="Sekmeler">
        <AnimatedTabs
          items={items}
          value={value}
          onValueChange={next => {
            setValue(next);
            setChanges(current => [...current, next]);
          }}
        >
          <AnimatedTabsList />
          <AnimatedTabsPanels>
            {item => (
              <div className="rounded-lg border p-4">{item.label} içeriği</div>
            )}
          </AnimatedTabsPanels>
        </AnimatedTabs>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setCount(current => current + 1)}
          >
            Rozeti artır
          </Button>
          <Button
            variant="outline"
            onClick={() => setArchiveCount(current => (current ? null : 5))}
          >
            Arşiv rozetini değiştir
          </Button>
        </div>
      </FixtureSection>
      <FixtureSection title="İkinci grup">
        <AnimatedTabs
          items={PERIOD_ITEMS}
          value={period}
          onValueChange={setPeriod}
        >
          <AnimatedTabsList />
          <AnimatedTabsPanels>
            {item => <p>{item.label} içeriği</p>}
          </AnimatedTabsPanels>
        </AnimatedTabs>
      </FixtureSection>
      <FixtureState value={{changes, value}} />
    </>
  );
}
