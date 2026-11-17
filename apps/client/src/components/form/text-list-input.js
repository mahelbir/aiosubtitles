'use client';

import {ArrayInput, ArrayItemActions} from '@/components/form/array-input';
import {FormField} from '@/components/form/form-field';
import {TextInput} from '@/components/form/text-input';

export function TextListInput({
  label,
  help,
  itemLabel = label,
  addLabel,
  max,
  disabled,
  readOnly,
  className,
  ...props
}) {
  return (
    <ArrayInput
      label={label}
      help={help}
      max={max}
      addLabel={addLabel}
      disabled={disabled}
      readOnly={readOnly}
      className={className}
      createItem={() => ''}
    >
      {({name, index}) => (
        <div className="flex items-start gap-2">
          <FormField name={name} className="min-w-0 flex-1">
            <TextInput
              {...props}
              readOnly={readOnly}
              aria-label={`${itemLabel} ${index + 1}`}
            />
          </FormField>
          <ArrayItemActions />
        </div>
      )}
    </ArrayInput>
  );
}
