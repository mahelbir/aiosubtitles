'use client';

import {useId, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Field, FieldLabel} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {useOptionSource, useWholeOptionList} from '@/hooks/use-option-source';
import {optionSource} from '@/lib/option-source';
import {
  fixtureUserOptionSources,
  getFixtureDepartmentOptionSource,
  toFixtureUserOption,
} from '../api';
import {useLatency} from '../hooks/use-latency';
import {fakeUsers} from '../lib/fake-users';
import {FixtureErrorBoundary} from './fixture-error-boundary';
import {FixtureSection} from './fixture-section';
import {FixtureState} from './fixture-state';

const DEFAULT_TOTAL = 150;

const CITY_OPTIONS = [
  {value: 1, label: 'Adana'},
  {value: 2, label: 'Ankara'},
  {value: 3, label: 'Antalya'},
  {value: 4, label: 'Bursa'},
  {value: 5, label: 'Çanakkale'},
  {value: 6, label: 'Diyarbakır'},
  {value: 7, label: 'Edirne'},
  {value: 8, label: 'Erzurum'},
  {value: 9, label: 'Isparta'},
  {value: 10, label: 'İstanbul'},
  {value: 11, label: 'İzmir'},
  {value: 12, label: 'Kars'},
  {value: 13, label: 'Kâhta'},
];

const SOURCES = {
  fixed: ({total}) => optionSource.fixed(CITY_OPTIONS.slice(0, total)),
  preloaded: getFixtureDepartmentOptionSource,
  pages: fixtureUserOptionSources.preloadedPages,
  remote: fixtureUserOptionSources.remote,
};

function parseIds(text) {
  return text ? text.split(',').map(Number) : [];
}

function getKnownUsers(total, ids) {
  if (!ids.length) {
    return [];
  }
  return fakeUsers
    .list({total, query: {id: ids, pageSize: ids.length}})
    .items.map(toFixtureUserOption);
}

function toLabels(options) {
  return options.map(option => option.label);
}

export function OptionSourceFixture() {
  const searchParams = useSearchParams();
  const latency = useLatency();
  const total = Number(searchParams.get('total') ?? DEFAULT_TOTAL);
  const source = SOURCES[searchParams.get('kind') ?? 'fixed']({
    source: searchParams.has('api') ? 'api' : 'memory',
    total,
    latency,
  });

  if (searchParams.has('whole')) {
    return (
      <FixtureErrorBoundary>
        <WholeListScenario key={searchParams.toString()} source={source} />
      </FixtureErrorBoundary>
    );
  }
  return (
    <SourceScenario
      key={searchParams.toString()}
      source={source}
      selected={parseIds(searchParams.get('selected'))}
      knownOptions={getKnownUsers(total, parseIds(searchParams.get('known')))}
    />
  );
}

function SourceScenario({source, selected, knownOptions}) {
  const searchId = useId();
  const [search, setSearch] = useState('');
  const {
    listed,
    filter,
    labelOf,
    total,
    matchTotal,
    isSearchable,
    hasFailed,
    emptyMessage,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useOptionSource(source, {search, selected, knownOptions});
  const shown = filter
    ? listed.filter(option => filter(option, search))
    : listed;

  return (
    <>
      <FixtureSection title="Seçenek kaynağı">
        <Field>
          <FieldLabel htmlFor={searchId}>Ara</FieldLabel>
          <Input
            id={searchId}
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </Field>
        <Button
          variant="outline"
          className="self-start"
          disabled={!hasNextPage || isFetchingNextPage}
          onClick={() => fetchNextPage()}
        >
          Daha fazla
        </Button>
      </FixtureSection>
      <FixtureState
        value={{
          listed: toLabels(shown),
          knownLabels: selected.map(labelOf),
          total,
          matchTotal,
          isSearchable,
          isRemote: filter === null,
          hasFailed,
          emptyMessage,
          hasNextPage,
        }}
      />
    </>
  );
}

function WholeListScenario({source}) {
  const {listed, isPending, hasFailed, emptyMessage} =
    useWholeOptionList(source);

  return (
    <FixtureState
      value={{listed: toLabels(listed), isPending, hasFailed, emptyMessage}}
    />
  );
}
