'use client';

import {useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {z} from 'zod';
import {httpUrlField} from '@repo/shared/schemas/common.js';
import {
  ArrayInput,
  ArrayItemActions,
  FilteredArrayInput,
} from '@/components/form/array-input';
import {Form} from '@/components/form/form';
import {FormField} from '@/components/form/form-field';
import {SubmitButton} from '@/components/form/submit-button';
import {TextInput} from '@/components/form/text-input';
import {Button} from '@/components/ui/button';
import {FieldLegend, FieldSet} from '@/components/ui/field';
import {useAppForm} from '@/lib/form';
import {useFieldStates} from '../hooks/use-field-states';
import {FixtureState} from './fixture-state';

const PEOPLE = ['Ali', 'Ayşe', 'Can'];

const peopleFormSchema = z.object({
  people: z
    .array(z.object({name: z.string().min(1, 'Ad gerekli')}))
    .min(1, 'En az bir kişi ekleyin'),
});

const linkFormSchema = z.object({links: z.array(httpUrlField).max(3)});

const PETS = [
  {kind: 'kedi', name: 'Tekir'},
  {kind: 'köpek', name: 'Karabaş'},
  {kind: 'kedi', name: 'Pamuk'},
];

const PET_LISTS = [
  {kind: 'kedi', label: 'Kediler', itemLabel: 'Kedi', max: 3},
  {kind: 'köpek', ariaLabel: 'Köpekler', itemLabel: 'Köpek', max: 3},
];

const petFormSchema = z.object({
  pets: z.array(
    z.object({kind: z.string(), name: z.string().min(1, 'Ad gerekli')}),
  ),
});

export function ArrayInputFixture() {
  const searchParams = useSearchParams();
  const count = Number(searchParams.get('count') ?? PEOPLE.length);
  const [submitted, setSubmitted] = useState(null);
  const [isListDisabled, setIsListDisabled] = useState(() =>
    searchParams.has('isDisabled'),
  );
  const [isListHidden, setIsListHidden] = useState(false);
  const submit = ({value}) => setSubmitted(value);
  const peopleForm = useAppForm({
    schema: peopleFormSchema,
    defaultValues: {people: PEOPLE.slice(0, count).map(name => ({name}))},
    errorDisplay: searchParams.get('errorDisplay') ?? undefined,
    onSubmit: submit,
  });
  const linkForm = useAppForm({
    schema: linkFormSchema,
    defaultValues: {
      links: [
        searchParams.has('hasInvalidLink') ? 'ftp://x' : 'https://ornek.com',
        'https://ornek.org',
      ],
    },
    onSubmit: submit,
  });
  const tagForm = useAppForm({defaultValues: {tags: ['yeni']}});
  const petForm = useAppForm({
    schema: petFormSchema,
    defaultValues: {pets: PETS},
    onSubmit: submit,
  });
  const fields = {
    ...useFieldStates(peopleForm),
    ...useFieldStates(linkForm),
    ...useFieldStates(petForm),
  };

  return (
    <>
      <Form form={peopleForm} aria-label="Kişi formu">
        <FormField name="people" mode="array">
          <ArrayInput
            label="Kişiler"
            min={Number(searchParams.get('min') ?? 0)}
            max={4}
            addLabel="Kişi ekle"
            createItem={() => ({name: ''})}
          >
            {({name, index}) => (
              <FieldSet>
                <FieldLegend variant="label">Kişi {index + 1}</FieldLegend>
                <div className="flex items-end gap-2">
                  <FormField name={`${name}.name`} className="flex-1">
                    <TextInput label="Ad" />
                  </FormField>
                  <ArrayItemActions />
                </div>
              </FieldSet>
            )}
          </ArrayInput>
        </FormField>
        <SubmitButton className="self-start">Gönder</SubmitButton>
      </Form>
      <Form form={linkForm} aria-label="Bağlantı formu">
        {!isListHidden && (
          <FormField name="links" mode="array">
            <FixtureTextList
              label="Bağlantılar"
              itemLabel="Bağlantı"
              addLabel="Bağlantı ekle"
              max={3}
              type="url"
              placeholder="https://…"
              help="En fazla üç bağlantı."
              disabled={isListDisabled}
              readOnly={searchParams.has('isReadOnly')}
            />
          </FormField>
        )}
        <SubmitButton className="self-start">Bağlantıları kaydet</SubmitButton>
      </Form>
      <Form form={tagForm} aria-label="Etiket formu">
        <FormField name="tags" mode="array">
          <FixtureTextList label="Etiket" />
        </FormField>
      </Form>
      <Form form={petForm} aria-label="Hayvan formu">
        {PET_LISTS.map(({kind, label, ariaLabel, itemLabel, max}) => (
          <FormField key={kind} name="pets" mode="array">
            <FilteredArrayInput
              label={label}
              aria-label={ariaLabel}
              max={max}
              addLabel={`${itemLabel} ekle`}
              help="Sıralamayı oklarla değiştirin."
              filter={pet => pet.kind === kind}
              createItem={() => ({kind, name: ''})}
            >
              {({name, index}) => (
                <FieldSet>
                  <FieldLegend variant="label">
                    {itemLabel} {index + 1}
                  </FieldLegend>
                  <div className="flex items-end gap-2">
                    <FormField name={`${name}.name`} className="flex-1">
                      <TextInput label="Ad" />
                    </FormField>
                    <ArrayItemActions />
                  </div>
                </FieldSet>
              )}
            </FilteredArrayInput>
          </FormField>
        ))}
        <SubmitButton className="self-start">Hayvanları kaydet</SubmitButton>
      </Form>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          aria-pressed={isListDisabled}
          onClick={() => setIsListDisabled(isDisabled => !isDisabled)}
        >
          Bağlantıları kilitle
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-pressed={isListHidden}
          onClick={() => setIsListHidden(isHidden => !isHidden)}
        >
          Bağlantıları gizle
        </Button>
      </div>
      <FixtureState value={{fields, submitted}} />
    </>
  );
}

function FixtureTextList({
  label,
  help,
  itemLabel = label,
  addLabel,
  max,
  disabled,
  readOnly,
  ...props
}) {
  return (
    <ArrayInput
      label={label}
      help={help}
      max={max}
      addLabel={addLabel}
      disabled={disabled}
      readOnly={readOnly}
      createItem={() => ''}
    >
      {({name, index}) => (
        <div className="flex items-start gap-2">
          <FormField name={name} className="min-w-0 flex-1">
            <TextInput
              {...props}
              readOnly={readOnly}
              aria-label={`${itemLabel} ${index + 1}`}
            />
          </FormField>
          <ArrayItemActions />
        </div>
      )}
    </ArrayInput>
  );
}
