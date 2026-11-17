'use client';

import {useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {useAutoAnimate} from '@/hooks/use-auto-animate';
import {FixtureSection} from './fixture-section';
import {FixtureState} from './fixture-state';

const ITEMS = ['Bir', 'İki'];

function fadePlugin(element, action) {
  const keyframes =
    action === 'remove'
      ? [{opacity: 1}, {opacity: 0}]
      : [{opacity: 0}, {opacity: 1}];
  return new KeyframeEffect(element, keyframes, {duration: 700});
}

function AnimatedList({items, animation}) {
  const listRef = useAutoAnimate(animation);

  return (
    <ul ref={listRef} aria-label="Öğeler" className="flex flex-col gap-2">
      {items.map(item => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function AutoAnimateFixture() {
  const searchParams = useSearchParams();
  const animation = searchParams.has('isPlugin')
    ? fadePlugin
    : {duration: 1000};
  const [items, setItems] = useState(ITEMS);
  const [isListHidden, setIsListHidden] = useState(false);

  return (
    <>
      <FixtureSection title="Liste">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setItems(current => [...current, `Öğe ${current.length + 1}`])
            }
          >
            Öğe ekle
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-pressed={isListHidden}
            onClick={() => setIsListHidden(isHidden => !isHidden)}
          >
            Listeyi gizle
          </Button>
        </div>
        {!isListHidden && <AnimatedList items={items} animation={animation} />}
      </FixtureSection>
      <FixtureState value={{items, isListHidden}} />
    </>
  );
}
