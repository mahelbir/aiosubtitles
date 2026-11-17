'use client';

import {useFieldControl} from '@/lib/form-context';
import {ChipsCombobox} from '@/components/form/chips-combobox';
import {FieldMessage} from '@/components/form/field-message';
import {Field} from '@/components/ui/field';
import {Label} from '@/components/ui/label';

export function ChipsInput({
  label,
  help,
  className,
  onBlur,
  'aria-describedby': ariaDescribedBy,
  ...props
}) {
  const {field, controlId, error, messageId, describedBy, handleBlur} =
    useFieldControl({
      help,
      props: {...props, onBlur, 'aria-describedby': ariaDescribedBy},
    });

  return (
    <Field className={className} data-invalid={Boolean(error)}>
      {label && <Label htmlFor={controlId}>{label}</Label>}
      <ChipsCombobox
        {...props}
        value={field.state.value ?? []}
        onValueChange={next => field.handleChange(next)}
        controlId={controlId}
        describedBy={describedBy}
        isInvalid={Boolean(error)}
        onBlur={handleBlur}
      />
      <FieldMessage id={messageId} error={error} help={help} />
    </Field>
  );
}
