'use client';

import {identity} from 'es-toolkit';
import {fromDateTimeInput, toDateTimeInput} from '@/lib/datetime';
import {useFieldControl} from '@/lib/form-context';
import {FieldMessage} from '@/components/form/field-message';
import {Field} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

const toDateValue = value => value ?? '';

function FormDateField({
  label,
  help,
  className,
  isNullable = false,
  type,
  format,
  parse,
  ...props
}) {
  const {field, controlId, error, messageId, describedBy, handleBlur} =
    useFieldControl({help, props});
  const emptyValue = isNullable ? null : undefined;

  return (
    <Field className={className} data-invalid={Boolean(error)}>
      {label && <Label htmlFor={controlId}>{label}</Label>}
      <Input
        type={type}
        {...props}
        id={controlId}
        name={field.name}
        value={format(field.state.value)}
        onChange={event => {
          const next = event.target.value;
          field.handleChange(next === '' ? emptyValue : parse(next));
        }}
        onBlur={handleBlur}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
      />
      <FieldMessage id={messageId} error={error} help={help} />
    </Field>
  );
}

export function DateInput(props) {
  return (
    <FormDateField
      {...props}
      type="date"
      format={toDateValue}
      parse={identity}
    />
  );
}

export function DateTimeInput(props) {
  return (
    <FormDateField
      {...props}
      type="datetime-local"
      format={toDateTimeInput}
      parse={fromDateTimeInput}
    />
  );
}
