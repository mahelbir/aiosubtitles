'use client';

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {ErrorAlert, WarningAlert} from '@/components/common/status-alerts';
import {FixtureSection} from './fixture-section';
import {FixtureState} from './fixture-state';

const PRESETS = [
  {name: 'error', title: 'Hata', Alert: ErrorAlert},
  {name: 'warning', title: 'Uyarı', Alert: WarningAlert},
];

export function StatusAlertsFixture() {
  const [presses, setPresses] = useState({});

  const press = name =>
    setPresses(current => ({...current, [name]: (current[name] ?? 0) + 1}));

  return (
    <>
      {PRESETS.map(({name, title, Alert}) => (
        <FixtureSection key={name} title={title}>
          <div data-testid={`${name}-alerts`} className="flex flex-col gap-2">
            <Alert
              title="Başlık"
              actions={
                <Button size="sm" variant="outline" onClick={() => press(name)}>
                  Tekrar dene
                </Button>
              }
            >
              Açıklama metni.
            </Alert>
            <Alert>Yalnızca metin.</Alert>
          </div>
        </FixtureSection>
      ))}
      <FixtureState value={{presses}} />
    </>
  );
}
