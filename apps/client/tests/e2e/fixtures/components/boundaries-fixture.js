'use client';

import {useSearchParams} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {QueryBoundary} from '@/components/common/query-boundary';
import {useIsOnline} from '@/hooks/use-is-online';
import {fixtureKeys, useFixtureEntity, useFixtureRecord} from '../api';
import {FixtureSection} from './fixture-section';
import {FixtureState} from './fixture-state';

const ENTITY_ID = '7';

export function BoundariesFixture() {
  const isErrorHandled = useSearchParams().has('isErrorHandled');
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const recordQuery = useFixtureRecord({meta: {isErrorHandled}});
  const entityQuery = useFixtureEntity(ENTITY_ID);

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
        <QueryBoundary query={entityQuery}>
          {entity => <p>{entity.name}</p>}
        </QueryBoundary>
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
          isOnline,
        }}
      />
    </>
  );
}
