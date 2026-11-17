'use client';

import {useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {pick} from 'es-toolkit';
import {useShallow} from 'zustand/react/shallow';
import {Button} from '@/components/ui/button';
import {useAuthStore} from '@/stores/auth-store';
import {
  fetchFixtureRecord,
  fetchFixtureRecordEnvelope,
  searchFixtureRecords,
  useFixtureEntity,
  useFixtureRecord,
  useUpdateFixtureProfile,
} from '../api';
import {usePromiseStates} from '../hooks/use-promise-states';
import {FixtureSection} from './fixture-section';
import {FixtureState} from './fixture-state';

const SESSION_SECONDS = 3600;

const SEARCH_QUERY = {
  ids: [3, 5],
  since: new Date(Date.UTC(2024, 4, 1, 9, 30)),
  days: [new Date(Date.UTC(2024, 4, 2)), new Date(Date.UTC(2024, 4, 3))],
  name: '',
  owner: null,
};

export function ApiClientFixture() {
  const searchParams = useSearchParams();
  const expiresIn = Number(searchParams.get('expiresIn') ?? SESSION_SECONDS);
  const [requests, track] = usePromiseStates();
  const [isQueryMounted, setIsQueryMounted] = useState(false);
  const [entityId, setEntityId] = useState(0);
  const profileMutation = useUpdateFixtureProfile();
  const session = useAuthStore(
    useShallow(state =>
      pick(state, [
        'accessToken',
        'refreshToken',
        'principal',
        'sessionExpired',
      ]),
    ),
  );
  const {setSession, clearSession} = useAuthStore.getState();

  return (
    <>
      <FixtureSection title="Oturum">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              setSession({
                accessToken: 'access-1',
                refreshToken: 'refresh-1',
                expiresIn,
              })
            }
          >
            Oturum aç
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setSession({
                accessToken: 'access-2',
                refreshToken: 'refresh-2',
                expiresIn: SESSION_SECONDS,
              })
            }
          >
            Başka oturum aç
          </Button>
          <Button variant="outline" onClick={clearSession}>
            Oturumu kapat
          </Button>
        </div>
      </FixtureSection>
      <FixtureSection title="İstekler">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => track('record', fetchFixtureRecord())}
          >
            Kaydı getir
          </Button>
          <Button
            variant="outline"
            onClick={() => track('envelope', fetchFixtureRecordEnvelope())}
          >
            Zarfı getir
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              track(
                'burst',
                Promise.all(
                  Array.from({length: 3}, () => fetchFixtureRecord()),
                ),
              )
            }
          >
            Üç kayıt getir
          </Button>
          <Button
            variant="outline"
            onClick={() => track('search', searchFixtureRecords(SEARCH_QUERY))}
          >
            Kayıtları ara
          </Button>
          <Button
            variant="outline"
            onClick={() => profileMutation.mutate({isSelf: true})}
          >
            Profilimi güncelle
          </Button>
          <Button
            variant="outline"
            onClick={() => profileMutation.mutate({isSelf: false})}
          >
            Başka profili güncelle
          </Button>
        </div>
      </FixtureSection>
      <FixtureSection title="Sorgu">
        <Button
          variant="outline"
          className="self-start"
          aria-pressed={isQueryMounted}
          onClick={() => setIsQueryMounted(current => !current)}
        >
          Kayıt sorgusu
        </Button>
        {isQueryMounted && <RecordQuery />}
        <Button
          variant="outline"
          className="self-start"
          onClick={() => setEntityId(current => current + 1)}
        >
          Sonraki varlık
        </Button>
        {entityId > 0 && <EntityQuery id={entityId} />}
      </FixtureSection>
      <FixtureState
        value={{
          session,
          requests,
          profile: profileMutation.status,
          isQueryMounted,
          entityId,
        }}
      />
    </>
  );
}

function RecordQuery() {
  const recordQuery = useFixtureRecord();

  return <p>{recordQuery.data?.name ?? 'Kayıt bekleniyor…'}</p>;
}

function EntityQuery({id}) {
  const entityQuery = useFixtureEntity(id);

  return <p>{entityQuery.data?.name ?? 'Varlık bekleniyor…'}</p>;
}
