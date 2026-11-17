'use client';

import {useState} from 'react';
import {mergeProps} from '@base-ui/react/merge-props';
import {useHeldWhileOpen} from '@/hooks/use-held-while-open';
import {useOptionSource} from '@/hooks/use-option-source';
import {useRemountFocus} from '@/hooks/use-remount-focus';
import {useFieldControl} from '@/lib/form-context';
import {FieldMessage} from '@/components/form/field-message';
import {
  OptionCombobox,
  OptionComboboxClear,
  OptionComboboxContent,
  OptionComboboxSearch,
} from '@/components/form/option-combobox';
import {
  OptionSelect,
  OptionSelectClear,
  OptionSelectContent,
} from '@/components/form/option-select';
import {ComboboxTrigger, ComboboxValue} from '@/components/ui/combobox';
import {Field} from '@/components/ui/field';
import {Label} from '@/components/ui/label';
import {SelectTrigger, SelectValue} from '@/components/ui/select';

const NO_SELECTION = [];
const CLEAR_LABEL = 'Seçimi temizle';

export function SelectInput({
  label,
  source,
  placeholder = 'Seç…',
  help,
  isSearchable,
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
  const [search, setSearch] = useState('');
  const focusProps = useRemountFocus();
  const value = field.state.value ?? null;
  const optionList = useOptionSource(source, {
    search,
    selected: value === null ? NO_SELECTION : [value],
  });
  const comboboxShown = useHeldWhileOpen(
    isSearchable ?? optionList.isSearchable,
  );
  const hasValue = value !== null;
  const rootProps = mergeProps(props, comboboxShown.popupProps, {
    optionList,
    value,
    onValueChange: next => field.handleChange(next),
  });
  const triggerProps = mergeProps(focusProps, comboboxShown.triggerProps, {
    id: controlId,
    className: 'w-full',
    'aria-invalid': Boolean(error),
    'aria-describedby': describedBy,
    onBlur: handleBlur,
  });

  return (
    <Field className={className} data-invalid={Boolean(error)}>
      {label && <Label htmlFor={controlId}>{label}</Label>}
      {comboboxShown.value ? (
        <OptionCombobox {...rootProps} onInputValueChange={setSearch}>
          <ComboboxTrigger variant="select" {...triggerProps}>
            <ComboboxValue placeholder={placeholder} />
          </ComboboxTrigger>
          <OptionComboboxContent
            actions={
              hasValue && (
                <OptionComboboxClear>{CLEAR_LABEL}</OptionComboboxClear>
              )
            }
          >
            <OptionComboboxSearch />
          </OptionComboboxContent>
        </OptionCombobox>
      ) : (
        <OptionSelect {...rootProps}>
          <SelectTrigger {...triggerProps}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <OptionSelectContent
            actions={
              hasValue && <OptionSelectClear>{CLEAR_LABEL}</OptionSelectClear>
            }
          />
        </OptionSelect>
      )}
      <FieldMessage id={messageId} error={error} help={help} />
    </Field>
  );
}
