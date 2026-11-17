'use client';

import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {mapValues} from 'es-toolkit';
import {Button} from '@/components/ui/button';
import {useBusy} from '@/hooks/use-busy';
import {appAlert} from '@/lib/app-alert';
import {withToast} from '@/lib/toast';
import {
  fixtureKeys,
  postFixtureEntry,
  useFixtureLedger,
  useInvalidatingFixtureEntry,
  usePostFixtureEntry,
  useSnapshotFixtureEntry,
  useToastFixtureEntry,
} from '../api';
import {usePromiseStates} from '../hooks/use-promise-states';
import {FixtureErrorBoundary} from './fixture-error-boundary';
import {FixtureSection} from './fixture-section';
import {FixtureState} from './fixture-state';

const MUTATION_BUTTONS = [
  {name: 'plain', label: 'Kaydet'},
  {name: 'handled', label: 'Kaydet, çağıran bildirsin'},
  {name: 'forced', label: 'Kaydet, bildirimi zorla'},
  {name: 'silenced', label: 'Kaydet, bildirimi kapat'},
  {name: 'formBound', label: 'Formdan kaydet'},
  {name: 'toasted', label: 'Bildirimli kaydet'},
  {name: 'invalidating', label: 'Kaydet ve yenile'},
  {name: 'settling', label: 'Kaydet, her durumda yenile'},
];

export function AlertsFixture() {
  const queryClient = useQueryClient();
  const [outcomes, track] = usePromiseStates();
  const [callbacks, setCallbacks] = useState({});
  const [ledgerAtCallback, setLedgerAtCallback] = useState(null);
  const [entryAtCallback, setEntryAtCallback] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isOnMutateClaimed, setIsOnMutateClaimed] = useState(false);
  const ledgerQuery = useFixtureLedger();

  const count = name =>
    setCallbacks(current => ({...current, [name]: (current[name] ?? 0) + 1}));
  const readLedger = () => queryClient.getQueryData(fixtureKeys.ledger());

  const mutations = {
    plain: usePostFixtureEntry(),
    handled: usePostFixtureEntry({
      onSuccess: () => {
        count('handledSuccess');
        setEntryAtCallback(readLedger()?.lastEntry ?? null);
      },
    }),
    forced: usePostFixtureEntry({
      toast: true,
      onSuccess: () => count('forcedSuccess'),
    }),
    silenced: usePostFixtureEntry({toast: false}),
    formBound: usePostFixtureEntry({isFormBound: true}),
    toasted: useToastFixtureEntry({
      toast: {
        pending: 'Gönderiliyor…',
        success: 'Gönderildi.',
        error: 'Gönderilemedi.',
      },
    }),
    invalidating: useInvalidatingFixtureEntry({
      onSuccess: () => setLedgerAtCallback(readLedger()?.fetchCount),
    }),
    settling: useInvalidatingFixtureEntry({invalidateOn: 'settled'}),
    removal: usePostFixtureEntry({toast: false}),
  };

  useBusy(isBusy);

  const remove = () =>
    track(
      'removal',
      appAlert.confirmDangerous('Kayıt silinsin mi?', {
        pending: 'Siliniyor…',
        onConfirm: () => mutations.removal.mutateAsync(),
        success: 'Kayıt silindi.',
        error: ({cause}) => cause.message,
      }),
    );

  return (
    <>
      <FixtureSection title="Uyarı penceresi">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              track('confirm', appAlert.confirm('İşleme devam edilsin mi?'))
            }
          >
            Onay iste
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              track(
                'dangerous',
                appAlert.confirmDangerous('Kayıt kalıcı olarak silinsin mi?'),
              )
            }
          >
            Tehlikeli onay iste
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              track(
                'info',
                appAlert.info('Rapor hazır', {
                  description: 'Rapor e-posta adresinize gönderildi.',
                }),
              )
            }
          >
            Bilgi ver
          </Button>
          <Button variant="destructive" onClick={remove}>
            Kaydı sil
          </Button>
        </div>
      </FixtureSection>
      <FixtureSection title="Bildirim">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              track(
                'task',
                withToast(postFixtureEntry(), {
                  pending: 'Görev çalışıyor…',
                  success: 'Görev tamamlandı.',
                  error: 'Görev başarısız.',
                }),
              )
            }
          >
            Görevi başlat
          </Button>
          <Button
            variant="outline"
            aria-pressed={isBusy}
            onClick={() => setIsBusy(current => !current)}
          >
            Meşgul
          </Button>
        </div>
      </FixtureSection>
      <FixtureSection title="Mutasyonlar">
        <div className="flex flex-wrap gap-2">
          {MUTATION_BUTTONS.map(({name, label}) => (
            <Button
              key={name}
              variant="outline"
              onClick={() => mutations[name].mutate()}
            >
              {label}
            </Button>
          ))}
          <Button
            variant="outline"
            aria-pressed={isOnMutateClaimed}
            onClick={() => setIsOnMutateClaimed(current => !current)}
          >
            Çağıran onMutate tanımlasın
          </Button>
        </div>
        {isOnMutateClaimed && (
          <FixtureErrorBoundary>
            <CallerOnMutate />
          </FixtureErrorBoundary>
        )}
      </FixtureSection>
      <FixtureState
        value={{
          outcomes,
          callbacks,
          isBusy,
          ledger: ledgerQuery.data ?? null,
          ledgerAtCallback,
          entryAtCallback,
          mutations: mapValues(mutations, mutation => mutation.status),
        }}
      />
    </>
  );
}

function CallerOnMutate() {
  useSnapshotFixtureEntry({onMutate: () => null});

  return null;
}
