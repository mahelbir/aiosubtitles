import {useEffect} from 'react';
import {useMountedState} from '@reactuses/core';
import {createFormHookContexts, useSelector} from '@tanstack/react-form';
import {compact} from 'es-toolkit';
import {clearDisabledField, registerDisabledField} from '@/lib/form';
import {afterPointerRelease} from '@/lib/pointer-release';

export const {fieldContext, formContext, useFieldContext, useFormContext} =
  createFormHookContexts();

/**
 * @param {{isBlurred: boolean, isDirty: boolean, errors: Array<string|{message: string}>}} [meta]
 * @param {number} submissionAttempts
 * @param {"onDirtyBlur"|"onTouched"|"onChange"|"onSubmit"} [errorDisplay]
 * @returns {string|null}
 */
export function metaError(
  meta,
  submissionAttempts,
  errorDisplay = 'onDirtyBlur',
) {
  if (!meta) {
    return null;
  }
  const isVisible =
    submissionAttempts > 0 ||
    errorDisplay === 'onChange' ||
    (errorDisplay === 'onTouched' && meta.isBlurred) ||
    // reward early, punish late
    (errorDisplay === 'onDirtyBlur' && meta.isBlurred && meta.isDirty);
  if (!isVisible) {
    return null;
  }
  const [error] = meta.errors;
  if (!error) {
    return null;
  }
  return typeof error === 'string' ? error : error.message;
}

function selectSubmissionAttempts(state) {
  return state.submissionAttempts;
}

export function useFieldMessage() {
  const field = useFieldContext();
  const submissionAttempts = useSelector(
    field.form.store,
    selectSubmissionAttempts,
  );
  const controlId = `${field.form.formId}-${field.name}`;
  return {
    field,
    error: metaError(
      field.state.meta,
      submissionAttempts,
      field.form.options.errorDisplay,
    ),
    controlId,
    messageId: `${controlId}-message`,
  };
}

/**
 * @param {{
 *   type?: "text"|"checkbox"|"multiselect",
 *   help?: React.ReactNode,
 *   props?: {onBlur?: function(React.FocusEvent): void, "aria-describedby"?: string, disabled?: boolean},
 * }} [options]
 * @returns {{
 *   field: ReturnType<typeof useFieldContext>,
 *   error: string|null,
 *   controlId: string,
 *   messageId: string,
 *   describedBy: string|undefined,
 *   handleBlur: function(React.FocusEvent): void,
 *   controlProps: Record<string, any>,
 * }}
 */
export function useFieldControl({type = 'text', help, props = {}} = {}) {
  const {field, error, controlId, messageId} = useFieldMessage();
  const isMounted = useMountedState();
  const isDisabled = Boolean(props.disabled);
  useEffect(() => {
    if (isDisabled) {
      return registerDisabledField(field.form, field.name);
    }
    clearDisabledField(field.form, field.name);
  }, [isDisabled, field.form, field.name]);
  const ownDescribedBy = error || help ? messageId : undefined;
  const describedBy =
    compact([props['aria-describedby'], ownDescribedBy]).join(' ') || undefined;
  const handleBlur = event => {
    props.onBlur?.(event);
    afterPointerRelease(() => {
      if (isMounted()) {
        field.handleBlur();
      }
    });
  };
  const base = {
    id: controlId,
    name: field.name,
    onBlur: handleBlur,
    isInvalid: Boolean(error),
    'aria-describedby': describedBy,
  };
  let controlProps;
  switch (type) {
    case 'checkbox':
      controlProps = {
        ...base,
        checked: Boolean(field.state.value),
        onChange: event => field.handleChange(event.target.checked),
      };
      break;
    case 'multiselect':
      controlProps = {
        ...base,
        multiple: true,
        value: field.state.value ?? [],
        onChange: event =>
          field.handleChange(
            [...event.target.selectedOptions].map(option => option.value),
          ),
      };
      break;
    default:
      controlProps = {
        ...base,
        value: field.state.value,
        onChange: event => field.handleChange(event.target.value),
      };
  }
  return {
    field,
    error,
    controlId,
    messageId,
    describedBy,
    handleBlur,
    controlProps,
  };
}
