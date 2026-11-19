'use client';

import {useState} from 'react';
import {EyeIcon, EyeOffIcon} from 'lucide-react';
import {useFieldControl, useFieldMessage} from '@/lib/form-context';
import {getInputTypeProps} from '@/lib/form';
import {FieldMessage} from '@/components/form/field-message';
import {Field} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import {Label} from '@/components/ui/label';

const PASSWORD_TYPE = 'password';

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

export function PasswordControl({help, ...props}) {
  const [isRevealed, setIsRevealed] = useState(false);
  const {controlProps} = useFieldControl({help, props});
  const {isInvalid, ...inputProps} = controlProps;
  return (
    <InputGroup>
      <InputGroupInput
        {...getInputTypeProps(PASSWORD_TYPE)}
        {...props}
        {...inputProps}
        type={isRevealed ? 'text' : PASSWORD_TYPE}
        aria-invalid={isInvalid}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label="Show"
          aria-pressed={isRevealed}
          onClick={() => setIsRevealed(isShown => !isShown)}
        >
          {isRevealed ? <EyeOffIcon /> : <EyeIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

function LabelledControl({control: Control, label, help, className, ...props}) {
  const {controlId, error, messageId} = useFieldMessage();
  return (
    <Field className={className} data-invalid={Boolean(error)}>
      {label && <Label htmlFor={controlId}>{label}</Label>}
      <Control help={help} {...props} />
      <FieldMessage id={messageId} error={error} help={help} />
    </Field>
  );
}

export function TextInput(props) {
  return <LabelledControl control={TextControl} {...props} />;
}

export function PasswordInput(props) {
  return <LabelledControl control={PasswordControl} {...props} />;
}
