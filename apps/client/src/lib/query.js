import {useInfiniteQuery, useMutation, useQuery} from '@tanstack/react-query';
import {withToast} from '@/lib/toast';

const COMPOSED_CALLBACKS = ['onSuccess', 'onError', 'onSettled'];
const HOOK_OWNED_CALLBACKS = ['onMutate'];

function compose(first, second) {
  if (!first || !second) {
    return first ?? second;
  }
  return async (...args) => {
    try {
      await first(...args);
    } finally {
      await second(...args);
    }
  };
}

function mergeOptions(self, caller = {}) {
  const merged = {...self, ...caller, meta: {...self.meta, ...caller.meta}};
  for (const name of COMPOSED_CALLBACKS) {
    merged[name] = compose(self[name], caller[name]);
  }
  for (const name of HOOK_OWNED_CALLBACKS) {
    if (self[name] && caller[name]) {
      throw new Error(`${name} is owned by the hook and cannot be overridden.`);
    }
    merged[name] = self[name] ?? caller[name];
  }
  return merged;
}

function isHandled(toast, callerCallback) {
  return toast === false || (toast === undefined && Boolean(callerCallback));
}

function toQueryOptions(selfOptions, callerOptions) {
  const {hasIndicator = true, ...queryOptions} = mergeOptions(
    selfOptions,
    callerOptions,
  );
  return {...queryOptions, meta: {...queryOptions.meta, hasIndicator}};
}

function withHandledError(selfOptions) {
  return {...selfOptions, meta: {...selfOptions.meta, isErrorHandled: true}};
}

/**
 * @param {import("@tanstack/react-query").UseQueryOptions & Object} selfOptions
 * @param {boolean} [selfOptions.hasIndicator]
 * @param {import("@tanstack/react-query").UseQueryOptions & Object} [callerOptions]
 * @param {import("@tanstack/react-query").QueryClient} [queryClient]
 * @returns {import("@tanstack/react-query").UseQueryResult}
 */
export function useAppQuery(selfOptions, callerOptions, queryClient) {
  return useQuery(toQueryOptions(selfOptions, callerOptions), queryClient);
}

/**
 * @param {import("@tanstack/react-query").UseInfiniteQueryOptions & Object} selfOptions
 * @param {boolean} [selfOptions.hasIndicator]
 * @param {import("@tanstack/react-query").UseInfiniteQueryOptions & Object} [callerOptions]
 * @param {import("@tanstack/react-query").QueryClient} [queryClient]
 * @returns {import("@tanstack/react-query").UseInfiniteQueryResult}
 */
export function useAppInfiniteQuery(selfOptions, callerOptions, queryClient) {
  return useInfiniteQuery(
    toQueryOptions(selfOptions, callerOptions),
    queryClient,
  );
}

/**
 * @param {import("@tanstack/react-query").UseQueryOptions & Object} selfOptions
 * @param {boolean} [selfOptions.hasIndicator]
 * @param {import("@tanstack/react-query").UseQueryOptions & Object} [callerOptions]
 * @param {import("@tanstack/react-query").QueryClient} [queryClient]
 * @returns {import("@tanstack/react-query").UseQueryResult}
 */
export function useOptionsQuery(selfOptions, callerOptions, queryClient) {
  return useAppQuery(withHandledError(selfOptions), callerOptions, queryClient);
}

/**
 * @param {import("@tanstack/react-query").UseInfiniteQueryOptions & Object} selfOptions
 * @param {boolean} [selfOptions.hasIndicator]
 * @param {import("@tanstack/react-query").UseInfiniteQueryOptions & Object} [callerOptions]
 * @param {import("@tanstack/react-query").QueryClient} [queryClient]
 * @returns {import("@tanstack/react-query").UseInfiniteQueryResult}
 */
export function useOptionsInfiniteQuery(
  selfOptions,
  callerOptions,
  queryClient,
) {
  return useAppInfiniteQuery(
    withHandledError(selfOptions),
    callerOptions,
    queryClient,
  );
}

export function isTransientRefetchError(error, data) {
  return data !== undefined && Boolean(error?.isTransient);
}

export function hasBlockingError(query) {
  return (
    Boolean(query?.isError) && !isTransientRefetchError(query.error, query.data)
  );
}

/**
 * @param {import("@tanstack/react-query").UseMutationOptions & Object} selfOptions
 * @param {boolean} [selfOptions.isFormBound]
 * @param {function(Error): boolean} [selfOptions.isRenderedError]
 * @param {boolean} [selfOptions.toast]
 * @param {boolean} [selfOptions.hasIndicator]
 * @param {Array|Array[]} [selfOptions.invalidates]
 * @param {'success'|'settled'} [selfOptions.invalidateOn]
 * @param {import("@tanstack/react-query").UseMutationOptions & Object} [callerOptions]
 * @param {import("@tanstack/react-query").QueryClient} [queryClient]
 * @returns {import("@tanstack/react-query").UseMutationResult}
 */
export function useAppMutation(selfOptions, callerOptions, queryClient) {
  const {
    isFormBound = false,
    isRenderedError,
    toast,
    hasIndicator = true,
    invalidates,
    invalidateOn = 'success',
    ...mutationOptions
  } = mergeOptions(selfOptions, callerOptions);
  return useMutation(
    {
      ...mutationOptions,
      meta: {
        ...mutationOptions.meta,
        isFormBound,
        isRenderedError,
        hasIndicator,
        invalidates,
        invalidateOn,
        isSuccessHandled: isHandled(toast, callerOptions?.onSuccess),
        isErrorHandled: isHandled(toast, callerOptions?.onError),
      },
    },
    queryClient,
  );
}

/**
 * @param {import("@tanstack/react-query").UseMutationOptions & Object} selfOptions
 * @param {Object} [selfOptions.toast]
 * @param {import("@tanstack/react-query").UseMutationOptions & Object} [callerOptions]
 * @param {import("@tanstack/react-query").QueryClient} [queryClient]
 * @returns {import("@tanstack/react-query").UseMutationResult}
 */
export function useToastMutation(selfOptions, callerOptions, queryClient) {
  const {toast: messages, ...options} = mergeOptions(
    selfOptions,
    callerOptions,
  );
  const mutation = useAppMutation(
    {...options, toast: false, hasIndicator: false},
    undefined,
    queryClient,
  );

  const mutateAsync = (variables, mutateOptions) =>
    withToast(mutation.mutateAsync(variables, mutateOptions), messages);

  return {
    ...mutation,
    mutateAsync,
    mutate: (variables, mutateOptions) => {
      mutateAsync(variables, mutateOptions).catch(() => {});
    },
  };
}
