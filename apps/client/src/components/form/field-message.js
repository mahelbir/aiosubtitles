'use client';

import {useFieldMessage} from '@/lib/form-context';
import {FieldDescription, FieldError} from '@/components/ui/field';

export function FieldMessage({id, error, help}) {
  if (error) {
    return <FieldError id={id}>{error}</FieldError>;
  }
  return help ? <FieldDescription id={id}>{help}</FieldDescription> : null;
}

export function FormFieldMessage({help}) {
  const {error, messageId} = useFieldMessage();
  return <FieldMessage id={messageId} error={error} help={help} />;
}
