'use client';

import {useFieldControl, useFieldMessage} from '@/lib/form-context';
import {getInputTypeProps} from '@/lib/form';
import {FieldMessage} from '@/components/form/field-message';
import {Field} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

export function TextControl({help, type = 'text', ...props}) {
  const {controlProps} = useFieldControl({help, props});
  const {isInvalid, ...inputProps} = controlProps;
  return (
    <Input
      type={type}
      {...getInputTypeProps(type)}
      {...props}
      {...inputProps}
      aria-invalid={isInvalid}
    />
  );
}

export function TextInput({label, help, className, ...props}) {
  const {controlId, error, messageId} = useFieldMessage();
  return (
    <Field className={className} data-invalid={Boolean(error)}>
      {label && <Label htmlFor={controlId}>{label}</Label>}
      <TextControl help={help} {...props} />
      <FieldMessage id={messageId} error={error} help={help} />
    </Field>
  );
}
