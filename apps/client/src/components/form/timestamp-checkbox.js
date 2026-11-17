'use client';

import {isNotNil} from 'es-toolkit';
import {CheckboxInput} from '@/components/form/checkbox-input';
import {timestamp} from '@/lib/datetime';

export function TimestampCheckbox({
  isCheckedWhenEmpty = false,
  unix,
  ...props
}) {
  return (
    <CheckboxInput
      {...props}
      format={value => isNotNil(value) !== isCheckedWhenEmpty}
      parse={checked =>
        checked === isCheckedWhenEmpty ? null : timestamp(unix)
      }
    />
  );
}
