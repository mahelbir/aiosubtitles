'use client';

import {Fragment} from 'react';
import {identity, isNil} from 'es-toolkit';
import {ToggleGroup, ToggleGroupItem} from '@/components/ui/toggle-group';

export function SingleToggleGroup({
  value,
  onChange,
  options,
  renderItem = identity,
  ...props
}) {
  return (
    <ToggleGroup
      variant="outline"
      {...props}
      value={isNil(value) ? [] : [value]}
      onValueChange={next => onChange(next[0] ?? value)}
    >
      {options.map(option => (
        <Fragment key={option.value}>
          {renderItem(
            <ToggleGroupItem
              value={option.value}
              disabled={option.disabled}
              aria-label={option.ariaLabel}
            >
              {option.label}
            </ToggleGroupItem>,
            option,
          )}
        </Fragment>
      ))}
    </ToggleGroup>
  );
}
