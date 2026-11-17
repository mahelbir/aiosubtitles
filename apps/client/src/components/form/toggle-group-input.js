'use client';

import {identity} from 'es-toolkit';
import {useFieldControl, useFieldMessage} from '@/lib/form-context';
import {
  InfoPopover,
  InfoPopoverContent,
  InfoPopoverTrigger,
} from '@/components/common/info-popover';
import {SingleToggleGroup} from '@/components/common/single-toggle-group';
import {FieldMessage} from '@/components/form/field-message';
import {Field, FieldLegend, FieldSet} from '@/components/ui/field';

export function ToggleGroupControl({
  options = [],
  help,
  format = identity,
  parse = identity,
  disabled,
  readOnly,
  ...props
}) {
  const {field, error, describedBy, handleBlur} = useFieldControl({
    help,
    props: {...props, disabled},
  });

  return (
    <InfoPopover>
      {({payload}) => (
        <>
          <SingleToggleGroup
            spacing={0}
            renderItem={renderOptionHelp}
            {...props}
            disabled={disabled || readOnly}
            options={options}
            value={format(field.state.value)}
            onChange={value => field.handleChange(parse(value))}
            onBlur={handleBlur}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
          />
          <InfoPopoverContent initialFocus={false}>
            {payload}
          </InfoPopoverContent>
        </>
      )}
    </InfoPopover>
  );
}

export function ToggleGroupInput({label, help, className, disabled, ...props}) {
  const {error, messageId} = useFieldMessage();

  return (
    <Field
      className={className}
      data-invalid={Boolean(error)}
      data-disabled={disabled}
    >
      <FieldSet>
        {label && <FieldLegend variant="label">{label}</FieldLegend>}
        <ToggleGroupControl help={help} disabled={disabled} {...props} />
      </FieldSet>
      <FieldMessage id={messageId} error={error} help={help} />
    </Field>
  );
}

function renderOptionHelp(item, option) {
  return option.help ? (
    <InfoPopoverTrigger payload={option.help} render={item} />
  ) : (
    item
  );
}
