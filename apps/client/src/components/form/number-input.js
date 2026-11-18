'use client';

import {mergeProps} from '@base-ui/react/merge-props';
import {identity} from 'es-toolkit';
import {env} from '@/config/env';
import {useFieldContext, useFieldControl} from '@/lib/form-context';
import {FieldMessage} from '@/components/form/field-message';
import {Field} from '@/components/ui/field';
import {InputGroup, InputGroupInput} from '@/components/ui/input-group';
import {Label} from '@/components/ui/label';
import {
  NumberField as NumberFieldRoot,
  NumberFieldInput,
} from '@/components/ui/number-field';

const MINUS_SIGNS = new Set(['-', '−', '－', '‒', '–', '—', '﹣']);

function AddonControl({addon, ...props}) {
  return (
    <InputGroup>
      <NumberFieldInput render={<InputGroupInput />} {...props} />
      {addon}
    </InputGroup>
  );
}

export function NumberField({
  label,
  help,
  placeholder,
  className,
  control: Control = NumberFieldInput,
  value,
  onValueChange,
  min,
  max,
  step,
  formatOptions,
  children,
  ...props
}) {
  const {field, controlId, error, messageId, describedBy, handleBlur} =
    useFieldControl({help, props});
  const refuseMinusSign = event => {
    if (min >= 0 && MINUS_SIGNS.has(event.key)) {
      event.preventDefault();
    }
  };

  return (
    <Field className={className} data-invalid={Boolean(error)}>
      {label && <Label htmlFor={controlId}>{label}</Label>}
      <NumberFieldRoot
        id={controlId}
        name={field.name}
        locale={env.LOCALE}
        value={value ?? null}
        onValueChange={onValueChange}
        min={min}
        max={max}
        allowOutOfRange
        step={step}
        format={{useGrouping: false, ...formatOptions}}
      >
        <Control
          autoComplete="off"
          placeholder={placeholder}
          {...mergeProps(props, {onKeyDown: refuseMinusSign})}
          onBlur={handleBlur}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        />
      </NumberFieldRoot>
      <FieldMessage id={messageId} error={error} help={help} />
      {children}
    </Field>
  );
}

function FormNumberField({
  isNullable = false,
  format = identity,
  parse = identity,
  ...props
}) {
  const field = useFieldContext();
  const emptyValue = isNullable ? null : undefined;

  return (
    <NumberField
      {...props}
      value={format(field.state.value)}
      onValueChange={value =>
        field.handleChange(value === null ? emptyValue : parse(value))
      }
    />
  );
}

export function NumberInput(props) {
  return <FormNumberField {...props} />;
}

export function AddonNumberInput(props) {
  return <FormNumberField {...props} control={AddonControl} />;
}
