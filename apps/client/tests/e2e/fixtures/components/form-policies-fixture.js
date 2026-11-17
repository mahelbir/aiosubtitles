'use client';

import {useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {z} from 'zod';
import {getCrossFieldCheck} from '@repo/shared/schemas/common.js';
import {FieldMessage, FormFieldMessage} from '@/components/form/field-message';
import {Form} from '@/components/form/form';
import {FormField} from '@/components/form/form-field';
import {FormGrid} from '@/components/form/form-grid';
import {NumberInput} from '@/components/form/number-input';
import {SaveButton} from '@/components/form/save-button';
import {SubmitButton} from '@/components/form/submit-button';
import {TextControl, TextInput} from '@/components/form/text-input';
import {ToggleGroupControl} from '@/components/form/toggle-group-input';
import {UnsavedChangesGuard} from '@/components/form/unsaved-changes-guard';
import {Button} from '@/components/ui/button';
import {ButtonGroup} from '@/components/ui/button-group';
import {getBlankableSchema, omitBlankFields, useAppForm} from '@/lib/form';
import {useSubmitFormPolicies} from '../api';
import {useFieldStates} from '../hooks/use-field-states';
import {useFormStatus} from '../hooks/use-form-status';
import {FixtureState} from './fixture-state';

const PLAN_OPTIONS = [
  {value: 'basic', label: 'Temel'},
  {value: 'pro', label: 'Profesyonel'},
];

const PLAN_HELP = 'Faturalama planı.';

const SKIPPED_SAVE = {mutateAsync: async () => null};

const emailField = z.email('Geçerli bir e-posta girin');

const displayFormSchema = z.object({
  name: z.string().min(2, 'Ad en az 2 karakter olmalı'),
  email: emailField,
  phone: z.string().min(10, 'Telefon en az 10 haneli olmalı'),
  plan: z.enum(
    PLAN_OPTIONS.map(option => option.value),
    'Bir plan seçin',
  ),
});

const serverFormSchema = z.object({
  username: z.string().min(1, 'Kullanıcı adı gerekli'),
  email: emailField,
});

const SECRET_KEYS = ['secret', 'repeat'];

const secretFormSchema = getBlankableSchema(
  z
    .object({
      name: z.string().min(1, 'Ad gerekli'),
      secret: z.string().min(8, 'Anahtar en az 8 karakter olmalı'),
      repeat: z.string(),
    })
    .check(
      getCrossFieldCheck(
        SECRET_KEYS,
        values => values.secret === values.repeat,
        {message: 'Anahtarlar eşleşmiyor', path: ['repeat']},
      ),
    ),
  SECRET_KEYS,
);

const endpointFormSchema = z.object({
  host: z.string().min(1, 'Sunucu gerekli'),
  port: z.string().regex(/^\d+$/, 'Port bir sayı olmalı'),
});

const passwordFormSchema = z
  .object({password: z.string().min(1, 'Parola gerekli'), repeat: z.string()})
  .check(
    getCrossFieldCheck(
      ['password', 'repeat'],
      values => values.password === values.repeat,
      {message: 'Parolalar eşleşmiyor', path: ['repeat']},
    ),
  );

export function FormPoliciesFixture() {
  const searchParams = useSearchParams();
  const [isPhoneShown, setIsPhoneShown] = useState(true);
  const [secretPayload, setSecretPayload] = useState(null);
  const displayForm = useAppForm({
    schema: displayFormSchema,
    errorDisplay: searchParams.get('errorDisplay') ?? undefined,
    defaultValues: {name: '', email: '', phone: '', plan: null},
  });
  const mutation = useSubmitFormPolicies();
  const serverForm = useAppForm({
    schema: serverFormSchema,
    mutation: searchParams.has('isSaveSkipped') ? SKIPPED_SAVE : mutation,
    defaultValues: {username: 'ayse', email: 'ayse@example.com'},
  });
  const computedForm = useAppForm({
    defaultValues: {price: undefined, quantity: 1, total: 0},
  });
  const draftForm = useAppForm({defaultValues: {title: ''}});

  const updateTotal = () =>
    computedForm.setFieldValue(
      'total',
      (computedForm.getFieldValue('price') ?? 0) *
        (computedForm.getFieldValue('quantity') ?? 0),
      {dontRunListeners: true},
    );

  const updatePrice = () => {
    const total = computedForm.getFieldValue('total');
    const quantity = computedForm.getFieldValue('quantity');
    if (Number.isFinite(total) && quantity) {
      computedForm.setFieldValue('price', total / quantity, {
        dontRunListeners: true,
      });
    }
  };

  const displayStatus = useFormStatus(displayForm);
  const displayFields = useFieldStates(displayForm);
  const serverStatus = useFormStatus(serverForm);
  const serverFields = useFieldStates(serverForm);
  const computedFields = useFieldStates(computedForm);
  const draftStatus = useFormStatus(draftForm);

  return (
    <>
      <Form form={displayForm} aria-label="Görüntüleme formu">
        <FormGrid>
          <FormField name="name">
            <TextInput label="Ad" />
          </FormField>
          <FormField name="email">
            <TextInput label="E-posta" type="email" />
          </FormField>
          {isPhoneShown && (
            <FormField name="phone">
              <TextInput label="Telefon" type="tel" />
            </FormField>
          )}
          <FormField name="plan">
            <PlanRow />
          </FormField>
        </FormGrid>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsPhoneShown(isShown => !isShown)}
          >
            {isPhoneShown ? 'Telefon alanını kaldır' : 'Telefon alanını ekle'}
          </Button>
          <SubmitButton>Doğrula</SubmitButton>
        </div>
      </Form>
      <Form form={serverForm} aria-label="Sunucu formu">
        <FormGrid>
          <FormField name="username">
            <TextInput label="Kullanıcı adı" />
          </FormField>
          <FormField name="email">
            <TextInput label="E-posta" type="email" />
          </FormField>
        </FormGrid>
        <FieldMessage error={serverStatus.formError} />
        <SaveButton align="start" className="self-start" />
      </Form>
      <Form form={computedForm} aria-label="Hesaplama formu">
        <FormGrid>
          <FormField
            name="price"
            className="col-span-4"
            listeners={{onChange: updateTotal}}
          >
            <NumberInput label="Fiyat" />
          </FormField>
          <FormField
            name="quantity"
            className="col-span-4"
            listeners={{onChange: updateTotal}}
          >
            <NumberInput label="Adet" />
          </FormField>
          <FormField
            name="total"
            className="col-span-4"
            listeners={{onChange: updatePrice}}
          >
            <NumberInput label="Toplam" />
          </FormField>
        </FormGrid>
      </Form>
      <Form form={draftForm} aria-label="Taslak formu">
        <UnsavedChangesGuard />
        <FormGrid>
          <FormField name="title">
            <TextInput label="Başlık" />
          </FormField>
        </FormGrid>
      </Form>
      <PasswordForm />
      <SecretForm onSave={setSecretPayload} />
      <EndpointForm />
      <FixtureState
        value={{
          display: {...displayStatus, fields: displayFields, isPhoneShown},
          server: {...serverStatus, fields: serverFields},
          computed: {fields: computedFields},
          draft: draftStatus,
          secret: {payload: secretPayload},
        }}
      />
    </>
  );
}

function SecretForm({onSave}) {
  const form = useAppForm({
    schema: secretFormSchema,
    mutation: {
      mutateAsync: async values => {
        onSave(omitBlankFields(values, SECRET_KEYS));
        return null;
      },
    },
    defaultValues: {name: 'Servis', secret: '', repeat: ''},
  });

  return (
    <Form form={form} aria-label="Gizli alan formu">
      <FormGrid>
        <FormField name="name" className="col-span-4">
          <TextInput label="Ad" />
        </FormField>
        <FormField name="secret" className="col-span-4">
          <TextInput label="Anahtar" type="password" />
        </FormField>
        <FormField name="repeat" className="col-span-4">
          <TextInput label="Anahtar (Tekrar)" type="password" />
        </FormField>
      </FormGrid>
      <SubmitButton className="self-start">Anahtarı kaydet</SubmitButton>
    </Form>
  );
}

function PasswordForm() {
  const form = useAppForm({
    schema: passwordFormSchema,
    defaultValues: {password: '', repeat: ''},
  });

  return (
    <Form form={form} aria-label="Parola formu">
      <FormGrid>
        <FormField name="password" className="col-span-6">
          <TextInput label="Parola" type="password" />
        </FormField>
        <FormField name="repeat" className="col-span-6">
          <TextInput label="Parola (Tekrar)" type="password" />
        </FormField>
      </FormGrid>
      <SubmitButton className="self-start">Parolayı doğrula</SubmitButton>
    </Form>
  );
}

function EndpointForm() {
  const form = useAppForm({
    schema: endpointFormSchema,
    defaultValues: {host: '', port: ''},
  });

  return (
    <Form form={form} aria-label="Uç nokta formu">
      <ButtonGroup className="w-full">
        <FormField name="host" className={null}>
          <TextControl aria-label="Sunucu" placeholder="Sunucu" />
        </FormField>
        <FormField name="port" className={null}>
          <TextControl
            aria-label="Port"
            placeholder="Port"
            inputMode="numeric"
          />
        </FormField>
      </ButtonGroup>
      <FormField name="host" className={null}>
        <FormFieldMessage />
      </FormField>
      <FormField name="port" className={null}>
        <FormFieldMessage />
      </FormField>
      <SubmitButton className="self-start">Uç noktayı doğrula</SubmitButton>
    </Form>
  );
}

function PlanRow() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <ToggleGroupControl
        options={PLAN_OPTIONS}
        help={PLAN_HELP}
        aria-label="Plan"
      />
      <FormFieldMessage help={PLAN_HELP} />
    </div>
  );
}
