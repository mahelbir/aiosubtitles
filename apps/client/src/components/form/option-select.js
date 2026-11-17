'use client';

import {createContext, use} from 'react';
import {toOptionSections} from '@/lib/option-section';
import {getSelectionCap} from '@/lib/selection-cap';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectStatus,
} from '@/components/ui/select';

const OptionSelectContext = createContext(null);

export function OptionSelectClear({children}) {
  return (
    <>
      <SelectSeparator />
      <SelectGroup>
        <SelectItem value={null}>{children}</SelectItem>
      </SelectGroup>
    </>
  );
}

export function OptionSelect({optionList, value, max, children, ...props}) {
  return (
    <OptionSelectContext
      value={{...optionList, cap: getSelectionCap(value, max)}}
    >
      <Select itemToStringLabel={optionList.labelOf} value={value} {...props}>
        {children}
      </Select>
    </OptionSelectContext>
  );
}

export function OptionSelectContent({itemIndicator, actions, ...props}) {
  const {listed, isPending, pendingMessage, emptyMessage, cap} =
    use(OptionSelectContext);

  const renderItem = option => {
    const key = String(option.value);
    return (
      <SelectItem
        key={key}
        value={option.value}
        disabled={option.disabled || cap.isLocked(key)}
        indicator={itemIndicator}
      >
        {option.label}
      </SelectItem>
    );
  };

  const renderSection = section => {
    return (
      <SelectGroup key={section.key}>
        {section.key && <SelectLabel>{section.key}</SelectLabel>}
        {section.items.map(renderItem)}
      </SelectGroup>
    );
  };

  return (
    <SelectContent
      status={
        <>
          <SelectStatus>
            {listed.length === 0 && (isPending ? pendingMessage : emptyMessage)}
          </SelectStatus>
          <SelectStatus>{cap.message}</SelectStatus>
        </>
      }
      {...props}
    >
      {toOptionSections(listed).map(renderSection)}
      {actions}
    </SelectContent>
  );
}
