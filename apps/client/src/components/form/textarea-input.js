'use client';

import {useFieldControl} from '@/lib/form-context';
import {FieldMessage} from '@/components/form/field-message';
import {Field} from '@/components/ui/field';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';

export function TextareaInput({label, help, placeholder, className, ...props}) {
  const {controlId, error, messageId, controlProps} = useFieldControl({
    help,
    props,
  });
  const {isInvalid, ...inputProps} = controlProps;

  return (
    <Field className={className} data-invalid={isInvalid}>
      {label && <Label htmlFor={controlId}>{label}</Label>}
      <Textarea
        placeholder={placeholder}
        {...props}
        {...inputProps}
        aria-invalid={isInvalid}
      />
      <FieldMessage id={messageId} error={error} help={help} />
    </Field>
  );
}
