'use client';

import {useId} from 'react';
import {Field, FieldGroup, FieldLabel} from '@/components/ui/field';
import {Input} from '@/components/ui/input';

export function DateRangeFields({from, to, min, max, onRange}) {
  const id = useId();
  const fromId = `${id}-from`;
  const toId = `${id}-to`;

  const changeFrom = event => {
    const next = event.target.value;
    onRange({from: next, to: next && to && to < next ? next : to});
  };

  const changeTo = event => {
    const next = event.target.value;
    onRange({from: next && from && from > next ? next : from, to: next});
  };

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={fromId}>Başlangıç</FieldLabel>
        <Input
          id={fromId}
          type="date"
          value={from ?? ''}
          min={min}
          max={max}
          onChange={changeFrom}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={toId}>Bitiş</FieldLabel>
        <Input
          id={toId}
          type="date"
          value={to ?? ''}
          min={from || min}
          max={max}
          onChange={changeTo}
        />
      </Field>
    </FieldGroup>
  );
}
