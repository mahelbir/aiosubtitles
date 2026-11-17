'use client';

import {useSelector} from '@tanstack/react-form';
import {CheckboxInput} from '@/components/form/checkbox-input';
import {Form} from '@/components/form/form';
import {FormField} from '@/components/form/form-field';
import {FormGrid} from '@/components/form/form-grid';
import {TextInput} from '@/components/form/text-input';
import {useAppForm} from '@/lib/form';

export function FormGridFixture() {
  const form = useAppForm({
    defaultValues: {name: 'Ali', hasPhone: false, phone: ''},
  });
  const hasPhone = useSelector(form.store, state => state.values.hasPhone);

  return (
    <Form form={form} aria-label="Kişi formu">
      <FormGrid>
        <FormField name="name">
          <TextInput label="Ad" />
        </FormField>
        <FormField name="hasPhone">
          <CheckboxInput label="Ek alan" />
        </FormField>
        {hasPhone && (
          <FormField name="phone">
            <TextInput label="Telefon" type="tel" />
          </FormField>
        )}
      </FormGrid>
    </Form>
  );
}
