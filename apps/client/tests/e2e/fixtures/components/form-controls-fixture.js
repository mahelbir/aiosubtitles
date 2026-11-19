'use client';

import {useId, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {isEqual} from 'es-toolkit';
import {useSelector} from '@tanstack/react-form';
import {Form} from '@/components/form/form';
import {FormField} from '@/components/form/form-field';
import {FormGrid} from '@/components/form/form-grid';
import {SelectInput} from '@/components/form/select-input';
import {TextInput} from '@/components/form/text-input';
import {useAppForm} from '@/lib/form';
import {optionSource} from '@/lib/option-source';
import {
  fixtureUserOptionSources,
  getFixtureDepartmentOptionSource,
} from '../api';
import {useFieldStates} from '../hooks/use-field-states';
import {useLatency} from '../hooks/use-latency';
import {FixtureState} from './fixture-state';

const CITY_OPTIONS = [
  {value: 'istanbul', label: 'İstanbul'},
  {value: 'ankara', label: 'Ankara'},
  {value: 'izmir', label: 'İzmir'},
];

const COUNTRY_OPTIONS = [
  {value: 'tr', label: 'Türkiye'},
  {value: 'de', label: 'Almanya'},
  {value: 'fr', label: 'Fransa'},
  {value: 'it', label: 'İtalya'},
  {value: 'es', label: 'İspanya'},
  {value: 'nl', label: 'Hollanda'},
  {value: 'be', label: 'Belçika'},
  {value: 'at', label: 'Avusturya'},
  {value: 'ch', label: 'İsviçre'},
  {value: 'gr', label: 'Yunanistan'},
  {value: 'pt', label: 'Portekiz'},
  {value: 'pl', label: 'Polonya'},
];

const BRANCH_OPTIONS = [
  {value: 'kadikoy', label: 'Kadıköy', group: 'İstanbul'},
  {value: 'besiktas', label: 'Beşiktaş', group: 'İstanbul'},
  {value: 'cankaya', label: 'Çankaya', group: 'Ankara'},
  {value: 'kecioren', label: 'Keçiören', group: 'Ankara'},
  {value: 'konak', label: 'Konak', group: 'İzmir'},
  {value: 'bornova', label: 'Bornova', group: 'İzmir'},
  {value: 'uskudar', label: 'Üsküdar', group: 'İstanbul'},
  {value: 'sisli', label: 'Şişli', group: 'İstanbul'},
  {value: 'yenimahalle', label: 'Yenimahalle', group: 'Ankara'},
  {value: 'etimesgut', label: 'Etimesgut', group: 'Ankara'},
  {value: 'karsiyaka', label: 'Karşıyaka', group: 'İzmir'},
  {value: 'buca', label: 'Buca', group: 'İzmir'},
];

const USER_TOTAL = 150;

const CONTROLS = [
  {name: 'name', Control: TextInput, label: 'Ad'},
  {
    name: 'city',
    Control: SelectInput,
    label: 'Şehir',
    source: optionSource.fixed(CITY_OPTIONS),
  },
  {
    name: 'country',
    Control: SelectInput,
    label: 'Ülke',
    source: optionSource.fixed(COUNTRY_OPTIONS),
  },
];

const GROUPED_CONTROLS = [
  {
    name: 'office',
    label: 'Ofis',
    source: optionSource.fixed(BRANCH_OPTIONS.slice(0, 6)),
  },
  {name: 'branch', label: 'Şube', source: optionSource.fixed(BRANCH_OPTIONS)},
];

const OPTIONS_FIELDS = {
  api: DepartmentField,
  memory: DepartmentField,
  grouped: GroupedFields,
  users: UserField,
};

export function FormControlsFixture() {
  const hintId = useId();
  const searchParams = useSearchParams();
  const OptionsField = OPTIONS_FIELDS[searchParams.get('options')];
  const [callerBlurs, setCallerBlurs] = useState({});
  const form = useAppForm({
    defaultValues: {
      name: '',
      city: null,
      country: null,
      department: null,
      office: null,
      branch: null,
      user: null,
    },
  });
  const fields = useFieldStates(form);
  const hookBlurs = useSelector(form.store, selectBlurred, {
    compare: isEqual,
  });

  const countBlur = name =>
    setCallerBlurs(counts => ({...counts, [name]: (counts[name] ?? 0) + 1}));

  return (
    <>
      <p id={hintId} className="text-sm text-muted-foreground">
        Harici açıklama.
      </p>
      <Form form={form} aria-label="Kontrol formu">
        <FormGrid>
          {CONTROLS.map(({name, Control, ...props}) => (
            <FormField key={name} name={name}>
              <Control
                {...props}
                help={`${props.label} yardımı.`}
                aria-describedby={hintId}
                onBlur={() => countBlur(name)}
              />
            </FormField>
          ))}
          {OptionsField && <OptionsField />}
        </FormGrid>
      </Form>
      <FixtureState value={{fields, callerBlurs, hookBlurs}} />
    </>
  );
}

function DepartmentField() {
  const source = getFixtureDepartmentOptionSource({
    source: useSearchParams().get('options'),
    latency: useLatency(),
  });

  return (
    <FormField name="department">
      <SelectInput label="Departman" source={source} />
    </FormField>
  );
}

function GroupedFields() {
  return GROUPED_CONTROLS.map(({name, ...props}) => (
    <FormField key={name} name={name}>
      <SelectInput {...props} />
    </FormField>
  ));
}

function UserField() {
  const source = fixtureUserOptionSources.remote({
    source: 'memory',
    total: USER_TOTAL,
    latency: useLatency(),
  });

  return (
    <FormField name="user">
      <SelectInput label="Kullanıcı" source={source} />
    </FormField>
  );
}

function selectBlurred(state) {
  return Object.keys(state.fieldMeta)
    .filter(name => state.fieldMeta[name]?.isBlurred)
    .toSorted();
}
