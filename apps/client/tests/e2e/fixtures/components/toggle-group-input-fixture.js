'use client';

import {useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {Form} from '@/components/form/form';
import {FormField} from '@/components/form/form-field';
import {FormGrid} from '@/components/form/form-grid';
import {SubmitButton} from '@/components/form/submit-button';
import {ToggleGroupInput} from '@/components/form/toggle-group-input';
import {useAppForm} from '@/lib/form';
import {useFieldStates} from '../hooks/use-field-states';
import {
  FIXTURE_PLACEMENT_OPTIONS,
  FixturePlacement,
} from '../lib/fixture-placement';
import {FixtureState} from './fixture-state';

const STATUS_OPTIONS = [
  {value: 'true', label: 'Aktif'},
  {value: 'false', label: 'Pasif'},
];

const STATUS_VALIDATORS = {
  onSubmit: ({value}) => (value ? undefined : 'Pasif kayıt kaydedilemez.'),
};

const PLACEMENT_EXTRAS = {
  [FixturePlacement.ABOVE]: {help: 'Seçili rolün üstüne yerleşir.'},
  [FixturePlacement.SAME]: {disabled: true},
};

const placementOptions = FIXTURE_PLACEMENT_OPTIONS.map(option => ({
  ...option,
  ...PLACEMENT_EXTRAS[option.value],
}));

export function ToggleGroupInputFixture() {
  const searchParams = useSearchParams();
  const [submitted, setSubmitted] = useState(null);
  const form = useAppForm({
    defaultValues: {
      isActive: !searchParams.has('isPassive'),
      placement: FixturePlacement.ABOVE,
    },
    onSubmit: ({value}) => setSubmitted(value),
  });
  const fields = useFieldStates(form);

  return (
    <>
      <Form form={form} aria-label="Seçim formu">
        <FormGrid>
          <FormField name="isActive" validators={STATUS_VALIDATORS}>
            <ToggleGroupInput
              label="Durum"
              options={STATUS_OPTIONS}
              format={String}
              parse={value => value === 'true'}
              disabled={searchParams.has('isDisabled')}
              readOnly={searchParams.has('isReadOnly')}
            />
          </FormField>
          <FormField name="placement">
            <ToggleGroupInput label="Konum" options={placementOptions} />
          </FormField>
        </FormGrid>
        <SubmitButton className="self-start">Kaydet</SubmitButton>
      </Form>
      <FixtureState value={{fields, submitted}} />
    </>
  );
}
