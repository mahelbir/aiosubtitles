'use client';

import {isEqual} from 'es-toolkit';
import {useSelector} from '@tanstack/react-form';

export function useFormStatus(form) {
  return useSelector(form.store, selectFormStatus, {compare: isEqual});
}

function selectFormStatus(state) {
  return {
    isDirty: state.isDirty,
    isSubmitting: state.isSubmitting,
    isValid: state.isValid,
    submissionAttempts: state.submissionAttempts,
    formError: state.errorMap.onSubmit ?? null,
  };
}
