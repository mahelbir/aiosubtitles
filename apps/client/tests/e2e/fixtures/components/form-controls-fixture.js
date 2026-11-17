'use client';

import {useId, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {delay, isEqual} from 'es-toolkit';
import {useSelector} from '@tanstack/react-form';
import {CheckboxInput} from '@/components/form/checkbox-input';
import {CreatableMultiSelectInput} from '@/components/form/creatable-multi-select-input';
import {DateInput} from '@/components/form/date-input';
import {Form} from '@/components/form/form';
import {FormField} from '@/components/form/form-field';
import {FormGrid} from '@/components/form/form-grid';
import {MultiSelectInput} from '@/components/form/multi-select-input';
import {SelectInput} from '@/components/form/select-input';
import {TagsInput} from '@/components/form/tags-input';
import {TextInput} from '@/components/form/text-input';
import {TextareaInput} from '@/components/form/textarea-input';
import {TimestampCheckbox} from '@/components/form/timestamp-checkbox';
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
  {name: 'note', Control: TextareaInput, label: 'Not'},
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
  {name: 'birthDate', Control: DateInput, label: 'Doğum tarihi'},
  {name: 'isSubscribed', Control: CheckboxInput, label: 'Bülten'},
  {name: 'archivedAt', Control: TimestampCheckbox, label: 'Arşivlendi'},
];

const GROUPED_CONTROLS = [
  {
    name: 'office',
    label: 'Ofis',
    source: optionSource.fixed(BRANCH_OPTIONS.slice(0, 6)),
  },
  {name: 'branch', label: 'Şube', source: optionSource.fixed(BRANCH_OPTIONS)},
];

const HELD_DEPARTMENT = {value: 'arsiv', label: 'Arşiv', disabled: true};

const OPTIONS_FIELDS = {
  api: DepartmentField,
  memory: DepartmentField,
  held: HeldDepartmentsField,
  grouped: GroupedFields,
  users: UserField,
  members: MembersField,
  tags: TagsField,
  creatable: CreatableField,
};

export function FormControlsFixture() {
  const hintId = useId();
  const searchParams = useSearchParams();
  const OptionsField = OPTIONS_FIELDS[searchParams.get('options')];
  const latency = useLatency();
  const [callerBlurs, setCallerBlurs] = useState({});
  const [created, setCreated] = useState([]);
  const form = useAppForm({
    defaultValues: {
      name: '',
      note: '',
      city: null,
      country: null,
      department: null,
      departments: [HELD_DEPARTMENT.value],
      office: null,
      branch: null,
      user: null,
      members: [],
      tags: [],
      records: [],
      birthDate: undefined,
      isSubscribed: false,
      archivedAt: null,
    },
  });
  const fields = useFieldStates(form);
  const hookBlurs = useSelector(form.store, selectBlurred, {
    compare: isEqual,
  });

  const countBlur = name =>
    setCallerBlurs(counts => ({...counts, [name]: (counts[name] ?? 0) + 1}));

  const createRecord = async text => {
    setCreated(texts => [...texts, text]);
    await delay(latency);
    if (searchParams.get('create') === 'fail') {
      throw new Error('Kayıt oluşturulamadı.');
    }
    return {value: 'yeni', label: text};
  };

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
          {OptionsField && <OptionsField onCreate={createRecord} />}
        </FormGrid>
      </Form>
      <FixtureState value={{fields, callerBlurs, hookBlurs, created}} />
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

function HeldDepartmentsField() {
  return (
    <FormField name="departments">
      <MultiSelectInput
        label="Departmanlar"
        source={getFixtureDepartmentOptionSource({source: 'api'})}
        knownOptions={[HELD_DEPARTMENT]}
      />
    </FormField>
  );
}

function MembersField() {
  const searchParams = useSearchParams();
  const max = searchParams.has('max')
    ? Number(searchParams.get('max'))
    : undefined;
  const source = fixtureUserOptionSources.remote({
    source: 'memory',
    total: USER_TOTAL,
    latency: useLatency(),
  });

  return (
    <FormField name="members">
      <MultiSelectInput label="Üyeler" source={source} max={max} />
    </FormField>
  );
}

function TagsField() {
  const source = getFixtureDepartmentOptionSource({
    source: 'memory',
    latency: useLatency(),
  });

  return (
    <FormField name="tags">
      <TagsInput label="Etiketler" source={source} />
    </FormField>
  );
}

function CreatableField({onCreate}) {
  const latency = useLatency();
  const source =
    useSearchParams().get('source') === 'remote'
      ? fixtureUserOptionSources.remote({
          source: 'memory',
          total: USER_TOTAL,
          latency,
        })
      : getFixtureDepartmentOptionSource({source: 'memory', latency});

  return (
    <FormField name="records">
      <CreatableMultiSelectInput
        label="Kayıtlar"
        source={source}
        onCreate={onCreate}
      />
    </FormField>
  );
}

function selectBlurred(state) {
  return Object.keys(state.fieldMeta)
    .filter(name => state.fieldMeta[name]?.isBlurred)
    .toSorted();
}
