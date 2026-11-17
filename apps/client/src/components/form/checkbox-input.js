'use client';

import {useFieldControl} from '@/lib/form-context';
import {FieldMessage} from '@/components/form/field-message';
import {Checkbox} from '@/components/ui/checkbox';
import {Field} from '@/components/ui/field';
import {Label} from '@/components/ui/label';

const LABEL_SPACER = (
  <Label aria-hidden className="invisible hidden @md/field-group:flex">
    &nbsp;
  </Label>
);

function FormCheckboxField({
  label,
  help,
  className,
  spacer = null,
  rowClassName,
  format = Boolean,
  parse = checked => checked,
  ...props
}) {
  const {field, controlId, error, messageId, describedBy, handleBlur} =
    useFieldControl({type: 'checkbox', help, props});
  return (
    <Field className={className} data-invalid={Boolean(error)}>
      {spacer}
      <Field orientation="horizontal" className={rowClassName}>
        <Checkbox
          {...props}
          id={controlId}
          name={field.name}
          checked={format(field.state.value)}
          onCheckedChange={checked => field.handleChange(parse(checked))}
          onBlur={handleBlur}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        />
        {label && <Label htmlFor={controlId}>{label}</Label>}
      </Field>
      <FieldMessage id={messageId} error={error} help={help} />
    </Field>
  );
}

export function CheckboxInput(props) {
  return <FormCheckboxField {...props} />;
}

export function AlignedCheckboxInput(props) {
  return (
    <FormCheckboxField
      {...props}
      spacer={LABEL_SPACER}
      rowClassName="@md/field-group:h-8"
    />
  );
}
