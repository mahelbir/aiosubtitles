import {
  environmentManager,
  MutationCache,
  QueryCache,
  QueryClient,
} from '@tanstack/react-query';
import {toast} from 'react-toastify';
import {ErrorCode} from '@repo/shared/constants/error-code.js';
import {refreshPrincipal} from '@/api/principal';
import {isTransientRefetchError} from '@/lib/query';
import {useAuthStore} from '@/stores/auth-store';

export const ALL_QUERIES = Object.freeze([]);

function shouldRefreshPrincipal(mutation, variables) {
  const declared = mutation.meta?.touchPrincipal;
  if (!declared) {
    return false;
  }
  if (declared === true) {
    return true;
  }
  return Boolean(declared(variables, useAuthStore.getState().principal));
}

function toQueryKeys(invalidates) {
  if (!invalidates) {
    return [];
  }
  return Array.isArray(invalidates[0]) ? invalidates : [invalidates];
}

function invalidateDeclared(client, mutation, phase) {
  const {invalidates, invalidateOn} = mutation.meta ?? {};
  if (!invalidates || invalidateOn !== phase) {
    return undefined;
  }
  return Promise.all(
    toQueryKeys(invalidates).map(queryKey =>
      client.invalidateQueries({queryKey}),
    ),
  );
}

function makeQueryClient() {
  const mutationCache = new MutationCache({
    onSuccess: async (data, variables, _context, mutation) => {
      await invalidateDeclared(client, mutation, 'success');
      if (shouldRefreshPrincipal(mutation, variables)) {
        refreshPrincipal().catch(() => {});
      }
      if (!mutation.meta?.isSuccessHandled && data?.message) {
        toast.success(data.message);
      }
    },
    onSettled: (_data, _error, _variables, _context, mutation) =>
      invalidateDeclared(client, mutation, 'settled'),
    onError: (error, _variables, _context, mutation) => {
      const {isFormBound, isErrorHandled} = mutation.meta ?? {};
      if (isErrorHandled) {
        return;
      }
      if (isFormBound && error?.errorCode === ErrorCode.VALIDATION_ERROR) {
        return;
      }
      toast.error(error.message);
    },
  });
  const queryCache = new QueryCache({
    onError: (error, query) => {
      if (
        query.meta?.isErrorHandled ||
        !isTransientRefetchError(error, query.state.data)
      ) {
        return;
      }
      toast.error('Veriler güncellenemedi.', {toastId: 'query-refetch-error'});
    },
  });
  const client = new QueryClient({
    queryCache,
    mutationCache,
    defaultOptions: {
      mutations: {
        networkMode: 'always',
      },
      queries: {
        staleTime: 30000,
        gcTime: 300000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) =>
          Boolean(error?.isTransient) && failureCount < 1,
      },
    },
  });
  return client;
}

let browserQueryClient;

export function getQueryClient() {
  if (environmentManager.isServer()) {
    return makeQueryClient();
  }
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
