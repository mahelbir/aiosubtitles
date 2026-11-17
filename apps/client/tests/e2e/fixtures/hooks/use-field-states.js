'use client';

import {isEqual, mapValues} from 'es-toolkit';
import {useSelector} from '@tanstack/react-form';
import {metaError} from '@/lib/form-context';

export function useFieldStates(form) {
  return useSelector(form.store, selectFieldStates, {compare: isEqual});
}

function selectFieldStates(state) {
  return mapValues(state.values, (value, name) => ({
    value,
    type: typeof value,
    error: metaError(state.fieldMeta[name], 0, 'onChange'),
  }));
}
