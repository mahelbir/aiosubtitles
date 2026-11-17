'use client';

import {identity} from 'es-toolkit';
import {ChipsInput} from '@/components/form/chips-input';
import {optionSource} from '@/lib/option-source';

const NO_SUGGESTIONS = optionSource.fixed([]);
const FREE_TEXT = {hasItem: false, onCreate: identity};

export function TagsInput({source = NO_SUGGESTIONS, ...props}) {
  return (
    <ChipsInput
      {...props}
      source={optionSource.byLabel(source)}
      creatable={FREE_TEXT}
    />
  );
}
