'use client';

import {useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {
  PageEntityBoundary,
  PanelEntityBoundary,
} from '@/components/common/entity-boundary';
import {QueryBoundary} from '@/components/common/query-boundary';
import {useIsOnline} from '@/hooks/use-is-online';
import {fixtureKeys, useFixtureEntity, useFixtureRecord} from '../api';
import {FixtureSection} from './fixture-section';
import {FixtureState} from './fixture-state';

export function BoundariesFixture() {
  const searchParams = useSearchParams();
  const entityId = searchParams.get('entity') ?? '7';
  const isErrorHandled = searchParams.has('isErrorHandled');
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const [panelId, setPanelId] = useState(null);
  const [panelCloseCount, setPanelCloseCount] = useState(0);
  const recordQuery = useFixtureRecord({meta: {isErrorHandled}});
  const entityQuery = useFixtureEntity(entityId);

  const closePanel = () => {
    setPanelId(null);
    setPanelCloseCount(count => count + 1);
  };

  return (
    <>
      <FixtureSection title="Yenileme">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => recordQuery.refetch()}>
            Kaydı yenile
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              queryClient.invalidateQueries({queryKey: fixtureKeys.all})
            }
          >
            Tümünü yenile
          </Button>
        </div>
      </FixtureSection>
      <FixtureSection title="Sorgu sınırı">
        <QueryBoundary query={recordQuery}>
          {record => <p>{record.name}</p>}
        </QueryBoundary>
      </FixtureSection>
      <FixtureSection title="Kayıt sayfası">
        <PageEntityBoundary id={entityId} query={entityQuery} back="/fixtures">
          {entity => <p>{entity ? entity.name : 'Yeni kayıt'}</p>}
        </PageEntityBoundary>
      </FixtureSection>
      <FixtureSection title="Kayıt paneli">
        <Button
          variant="outline"
          className="self-start"
          onClick={() => setPanelId('9')}
        >
          Paneli aç
        </Button>
        {panelId && <EntityPanel id={panelId} onClose={closePanel} />}
      </FixtureSection>
      <FixtureState
        value={{
          record: {
            status: recordQuery.status,
            fetchStatus: recordQuery.fetchStatus,
          },
          entity: {
            status: entityQuery.status,
            fetchStatus: entityQuery.fetchStatus,
          },
          panel: {id: panelId, closeCount: panelCloseCount},
          isOnline,
        }}
      />
    </>
  );
}

function EntityPanel({id, onClose}) {
  const entityQuery = useFixtureEntity(id);

  return (
    <PanelEntityBoundary id={id} query={entityQuery} onClose={onClose}>
      {entity => <p>{entity.name}</p>}
    </PanelEntityBoundary>
  );
}
