import {defaultValidationLogic, useForm} from '@tanstack/react-form';
import {
  isEqual,
  isPlainObject,
  mapValues,
  omit,
  omitBy,
  partition,
  pick,
  remove,
  sortBy,
  uniq,
} from 'es-toolkit';
import {get, has, isEmpty, set, toPath} from 'es-toolkit/compat';
import {Immer} from 'immer';
import {useRef} from 'react';
import {toast} from 'react-toastify';
import {z} from 'zod';
import {ErrorCode} from '@repo/shared/constants/error-code.js';

const INPUT_MODES = {
  email: 'email',
  number: 'numeric',
  search: 'search',
  tel: 'tel',
  url: 'url',
};

const UNSPELLCHECKED_TYPES = new Set([
  'email',
  'password',
  'search',
  'tel',
  'url',
]);

export function getInputTypeProps(type) {
  return {
    ...(INPUT_MODES[type] && {inputMode: INPUT_MODES[type]}),
    ...(UNSPELLCHECKED_TYPES.has(type) && {spellCheck: false}),
  };
}

function canTakeFocus(element) {
  return (
    element instanceof HTMLElement &&
    element.tabIndex >= 0 &&
    !element.matches(':disabled')
  );
}

function findFocusTarget(element) {
  if (canTakeFocus(element)) {
    return element;
  }
  return [...element.querySelectorAll('*')].find(canTakeFocus);
}

function focusFirstControl(container, selector) {
  for (const match of container?.querySelectorAll(selector) ?? []) {
    const control = findFocusTarget(match);
    if (control) {
      control.focus({preventScroll: true});
      control.scrollIntoView({block: 'center'});
      return;
    }
  }
}

export function focusFirstError(container) {
  focusFirstControl(container, '[aria-invalid="true"]');
}

export function focusFirstField(container) {
  focusFirstControl(container, '[aria-invalid]');
}

export function hasUnsavedChanges(state) {
  return state.isDirty && !state.isSubmitting;
}

export function serverFormErrors(error, hasField) {
  if (
    error?.errorCode !== ErrorCode.VALIDATION_ERROR ||
    !Array.isArray(error?.data?.errors)
  ) {
    return null;
  }
  const [fieldless, named] = partition(error.data.errors, item => !item.field);
  const [known, orphaned] = partition(named, item => hasField(item.field));
  const formError = fieldless.at(-1)?.message;
  return {
    ...(formError && {form: formError}),
    fields: Object.fromEntries(known.map(item => [item.field, item.message])),
    orphans: uniq(orphaned.map(item => item.message)),
  };
}

const disabledControlCountsByForm = new WeakMap();

const OMITTED = Symbol('omitted');

const valuesImmer = new Immer({autoFreeze: false});

function getDisabledControlCounts(formApi) {
  if (!disabledControlCountsByForm.has(formApi)) {
    disabledControlCountsByForm.set(formApi, new Map());
  }
  return disabledControlCountsByForm.get(formApi);
}

export function isWithinField(path, name) {
  return (
    path === name || path.startsWith(`${name}.`) || path.startsWith(`${name}[`)
  );
}

function hasField(formApi, name) {
  return (
    Object.hasOwn(formApi.fieldInfo, name) || has(formApi.state.values, name)
  );
}

function getDisabledNames(formApi) {
  const controlCounts = getDisabledControlCounts(formApi);
  for (const [name, count] of controlCounts) {
    if (count === 0 && !hasField(formApi, name)) {
      controlCounts.delete(name);
    }
  }
  return [...controlCounts.keys()];
}

function isDisabledPath(formApi, path) {
  return getDisabledNames(formApi).some(name => isWithinField(path, name));
}

function clearFieldValidation(formApi, name) {
  for (const [path, info] of Object.entries(formApi.fieldInfo)) {
    if (isWithinField(path, name)) {
      for (const validationMeta of Object.values(info.validationMetaMap)) {
        validationMeta?.lastAbortController.abort();
      }
    }
  }
  for (const [path, meta] of Object.entries(formApi.state.fieldMeta)) {
    if (isWithinField(path, name) && meta.errors.length > 0) {
      formApi.setFieldMeta(path, prev => ({
        ...prev,
        errorMap: {},
        errorSourceMap: {},
      }));
    }
  }
}

export function registerDisabledField(formApi, name) {
  const controlCounts = getDisabledControlCounts(formApi);
  controlCounts.set(name, (controlCounts.get(name) ?? 0) + 1);
  clearFieldValidation(formApi, name);
  return () => {
    const count = controlCounts.get(name) - 1;
    if (count === 0 && !hasField(formApi, name)) {
      controlCounts.delete(name);
    } else {
      controlCounts.set(name, count);
    }
  };
}

export function clearDisabledField(formApi, name) {
  const controlCounts = getDisabledControlCounts(formApi);
  if (controlCounts.get(name) === 0) {
    controlCounts.delete(name);
  }
}

function skipDisabledFields(validationLogic) {
  return props => {
    const {fieldName} = props.event;
    if (fieldName !== undefined && isDisabledPath(props.form, fieldName)) {
      return props.runValidation({validators: [], form: props.form});
    }
    return validationLogic(props);
  };
}

function getEnabledIssues(formApi, schema) {
  const issues = formApi.parseValuesWithSchema(schema);
  if (!issues) {
    return undefined;
  }
  const fields = omitBy(issues.fields, (_, path) =>
    isDisabledPath(formApi, path),
  );
  return isEmpty(fields) ? undefined : {form: fields, fields};
}

function getSubmittedValues(formApi, values) {
  const names = getDisabledNames(formApi);
  const outermost = names.filter(
    name =>
      has(values, name) &&
      !names.some(other => other !== name && isWithinField(name, other)),
  );
  if (outermost.length === 0) {
    return values;
  }
  const paths = sortBy(
    outermost.map(name => toPath(name)),
    [path => -path.length],
  );
  return valuesImmer.produce(values, draft => {
    for (const path of paths) {
      set(draft, path, OMITTED);
    }
    for (const path of paths) {
      const parentPath = path.slice(0, -1);
      const parent = parentPath.length > 0 ? get(draft, parentPath) : draft;
      if (Array.isArray(parent)) {
        remove(parent, item => item === OMITTED);
      } else {
        delete parent[path.at(-1)];
      }
    }
  });
}

function isFormField(formApi, name) {
  return hasField(formApi, name) && !isDisabledPath(formApi, name);
}

export function isFieldDirty(formApi, name) {
  return Object.entries(formApi.state.fieldMeta).some(
    ([path, meta]) =>
      meta?.isDirty && (isWithinField(path, name) || isWithinField(name, path)),
  );
}

export function getChangedValues(values, baseline) {
  const changed = {};
  for (const [key, value] of Object.entries(values)) {
    const previous = baseline[key];
    if (isPlainObject(value) && isPlainObject(previous)) {
      const nested = getChangedValues(value, previous);
      if (!isEmpty(nested)) {
        changed[key] = nested;
      }
    } else if (!isEqual(value, previous)) {
      changed[key] = value;
    }
  }
  return changed;
}

export function getBlankableSchema(schema, keys) {
  return schema.safeExtend(
    mapValues(pick(schema.shape, keys), field => field.or(z.literal(''))),
  );
}

export function omitBlankFields(values, keys) {
  return omit(
    values,
    keys.filter(key => values[key] === ''),
  );
}

/**
 * @param {import("@tanstack/react-form").FormOptions & Object} options
 * @param {import("zod").ZodType} [options.schema]
 * @param {{mutateAsync: function(*): Promise<*>}} [options.mutation]
 * @param {Object} [options.validators]
 * @param {function(Object): *} [options.onSubmit]
 * @param {import("@tanstack/react-form").ValidationLogicFn} [options.validationLogic]
 * @returns {import("@tanstack/react-form").ReactFormExtendedApi}
 */
export function useAppForm({
  schema,
  mutation,
  validators,
  onSubmit,
  validationLogic = defaultValidationLogic,
  ...options
}) {
  const savedValuesRef = useRef(null);

  return useForm({
    validators: {
      ...(schema && {
        onChange: ({formApi}) => getEnabledIssues(formApi, schema),
      }),
      ...(mutation && {
        onSubmitAsync: async ({value, formApi}) => {
          savedValuesRef.current = null;
          try {
            const saved = await mutation.mutateAsync(
              getSubmittedValues(formApi, value),
            );
            if (saved !== null) {
              savedValuesRef.current = value;
            }
            return null;
          } catch (error) {
            const errors = serverFormErrors(error, name =>
              isFormField(formApi, name),
            );
            if (!errors) {
              return null;
            }
            const {orphans, ...mapped} = errors;
            if (orphans.length > 0) {
              toast.error(orphans.join(' '));
            }
            return mapped;
          }
        },
      }),
      ...validators,
    },
    ...((mutation || onSubmit) && {
      onSubmit: async props => {
        await onSubmit?.({
          ...props,
          value: getSubmittedValues(props.formApi, props.value),
        });
        const savedValues = savedValuesRef.current;
        savedValuesRef.current = null;
        if (savedValues && isEqual(props.formApi.state.values, savedValues)) {
          props.formApi.reset(savedValues, {keepDefaultValues: true});
        }
      },
    }),
    validationLogic: skipDisabledFields(validationLogic),
    canSubmitWhenInvalid: true,
    ...options,
  });
}
