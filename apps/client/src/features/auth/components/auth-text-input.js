'use client';

import {useFieldControl} from '@/lib/form-context';
import {getInputTypeProps} from '@/lib/form';
import {FieldMessage} from '@/components/form/field-message';
import {Field} from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';

export function AuthTextInput({
  icon: Icon,
  label,
  className,
  type = 'text',
  ...props
}) {
  const {error, messageId, controlProps} = useFieldControl({props});
  const {isInvalid, ...inputProps} = controlProps;
  return (
    <Field className={className} data-invalid={isInvalid}>
      <InputGroup className="h-10">
        {Icon && (
          <InputGroupAddon className="ps-3">
            <Icon />
          </InputGroupAddon>
        )}
        <InputGroupInput
          type={type}
          placeholder={label}
          aria-label={label}
          {...getInputTypeProps(type)}
          {...props}
          {...inputProps}
          aria-invalid={isInvalid}
        />
      </InputGroup>
      <FieldMessage id={messageId} error={error} />
    </Field>
  );
}
