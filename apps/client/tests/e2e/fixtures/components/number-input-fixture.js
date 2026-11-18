'use client';

import {useState} from 'react';
import {z} from 'zod';
import {Form} from '@/components/form/form';
import {FormField} from '@/components/form/form-field';
import {FormGrid} from '@/components/form/form-grid';
import {AddonNumberInput, NumberInput} from '@/components/form/number-input';
import {SubmitButton} from '@/components/form/submit-button';
import {ToggleGroupControl} from '@/components/form/toggle-group-input';
import {Button} from '@/components/ui/button';
import {InputGroupAddon} from '@/components/ui/input-group';
import {useAppForm} from '@/lib/form';
import {useFieldStates} from '../hooks/use-field-states';
import {FixtureState} from './fixture-state';

const DISCOUNT_TYPES = [
  {value: 'percent', label: '%', ariaLabel: 'Yüzde'},
  {value: 'fixed', label: '₺', ariaLabel: 'Sabit tutar'},
];

const firstFormSchema = z.object({
  amount: z.number().optional(),
  price: z.number().positive('Fiyat sıfırdan büyük olmalı'),
  id: z.number().int(),
  discount: z.number().optional(),
  discountType: z.enum(DISCOUNT_TYPES.map(type => type.value)),
  stock: z.number().int().nullable(),
  quantity: z.number().max(5, 'Adet en fazla 5 olabilir').optional(),
});

const secondFormSchema = z.object({
  amount: z.number().optional(),
});

export function NumberInputFixture() {
  const [submitted, setSubmitted] = useState(null);
  const firstForm = useAppForm({
    schema: firstFormSchema,
    defaultValues: {
      amount: undefined,
      price: undefined,
      id: undefined,
      discount: undefined,
      discountType: 'percent',
      stock: null,
      quantity: undefined,
    },
    onSubmit: ({value}) => setSubmitted(value),
  });
  const secondForm = useAppForm({
    schema: secondFormSchema,
    defaultValues: {amount: undefined},
  });
  const first = useFieldStates(firstForm);
  const second = useFieldStates(secondForm);

  return (
    <>
      <Form form={firstForm} aria-label="Birinci form">
        <FormGrid>
          <FormField name="amount">
            <NumberInput label="Tutar" />
          </FormField>
          <FormField name="price">
            <NumberInput label="Fiyat" min={0} />
          </FormField>
          <FormField name="id">
            <NumberInput label="Kayıt no" />
          </FormField>
          <FormField name="discount">
            <AddonNumberInput label="İndirim" addon={<DiscountTypeAddon />} />
          </FormField>
          <FormField name="stock">
            <NumberInput label="Stok" isNullable />
          </FormField>
          <FormField name="quantity">
            <NumberInput label="Adet" min={1} max={5} />
          </FormField>
        </FormGrid>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => firstForm.setFieldValue('amount', 1234.5)}
          >
            Tutarı dışarıdan ayarla
          </Button>
          <SubmitButton>Gönder</SubmitButton>
        </div>
      </Form>
      <Form form={secondForm} aria-label="İkinci form">
        <FormGrid>
          <FormField name="amount">
            <NumberInput label="Tutar" />
          </FormField>
        </FormGrid>
      </Form>
      <FixtureState value={{first, second, submitted}} />
    </>
  );
}

function DiscountTypeAddon() {
  return (
    <InputGroupAddon align="inline-end">
      <FormField name="discountType" className={null}>
        <ToggleGroupControl
          options={DISCOUNT_TYPES}
          size="sm"
          aria-label="İndirim türü"
        />
      </FormField>
    </InputGroupAddon>
  );
}
