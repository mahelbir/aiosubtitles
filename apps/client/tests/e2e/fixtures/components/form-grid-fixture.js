'use client';

import {useId} from 'react';
import {useSelector} from '@tanstack/react-form';
import {Form} from '@/components/form/form';
import {FormField} from '@/components/form/form-field';
import {FormGrid} from '@/components/form/form-grid';
import {TextInput} from '@/components/form/text-input';
import {Checkbox} from '@/components/ui/checkbox';
import {Field, FieldLabel} from '@/components/ui/field';
import {useAppForm} from '@/lib/form';

export function FormGridFixture() {
  const checkboxId = useId();
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
        <Field orientation="horizontal">
          <Checkbox
            id={checkboxId}
            checked={hasPhone}
            onCheckedChange={isChecked =>
              form.setFieldValue('hasPhone', isChecked)
            }
          />
          <FieldLabel htmlFor={checkboxId}>Ek alan</FieldLabel>
        </Field>
        {hasPhone && (
          <FormField name="phone">
            <TextInput label="Telefon" type="tel" />
          </FormField>
        )}
      </FormGrid>
    </Form>
  );
}
