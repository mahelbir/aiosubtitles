import {keepPreviousData, useQueryClient} from '@tanstack/react-query';
import {RoleDirection} from '@repo/shared/constants/role.js';
import {isNarrowedQuery} from '@/hooks/use-list-query';
import {apiData, apiEnvelope} from '@/lib/api-client';
import {useAppMutation, useAppQuery} from '@/lib/query';
import {ALL_QUERIES} from '@/lib/query-client';

export const roleKeys = {
  all: ['roles'],
  lists: () => [...roleKeys.all, 'list'],
  list: query => [...roleKeys.lists(), query],
  details: () => [...roleKeys.all, 'get'],
  get: id => [...roleKeys.details(), id],
};

export function fetchRoles(options) {
  return apiData('/roles', options);
}

export function fetchRole(id, options) {
  return apiData(`/roles/${id}`, options);
}

export function createRole(values) {
  return apiEnvelope('/roles', {method: 'POST', body: values});
}

export function updateRole(id, values) {
  return apiEnvelope(`/roles/${id}`, {method: 'PATCH', body: values});
}

export function deleteRole(id) {
  return apiEnvelope(`/roles/${id}`, {method: 'DELETE'});
}

export function moveRole({id, direction}) {
  return apiEnvelope(`/roles/${id}/move`, {
    method: 'PATCH',
    body: {direction},
  });
}

export function useRoles(query, options) {
  return useAppQuery(
    {
      queryKey: roleKeys.list(query),
      queryFn: ({signal}) => fetchRoles({query, signal}),
      placeholderData: keepPreviousData,
    },
    options,
  );
}

export function useRole(id, options) {
  return useAppQuery(
    {
      queryKey: roleKeys.get(id),
      queryFn: ({signal}) => fetchRole(id, {signal}),
      enabled: Boolean(id),
    },
    options,
  );
}

function swapNeighbour(items, id, direction) {
  const index = items.findIndex(item => item.id === id);
  const target = direction === RoleDirection.UP ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= items.length) {
    return items;
  }
  const swapped = [...items];
  swapped[index] = {...items[target], rank: items[index].rank};
  swapped[target] = {...items[index], rank: items[target].rank};
  return swapped;
}

const holdsRole = (variables, principal) => {
  const id = typeof variables === 'string' ? variables : variables?.id;
  return Boolean(id) && Boolean(principal?.roles?.some(role => role.id === id));
};

export function useCreateRole(options) {
  return useAppMutation(
    {isFormBound: true, mutationFn: createRole, invalidates: ALL_QUERIES},
    options,
  );
}

export function useUpdateRole(options) {
  return useAppMutation(
    {
      isFormBound: true,
      mutationFn: ({id, values}) => updateRole(id, values),
      invalidates: ALL_QUERIES,
      meta: {touchPrincipal: holdsRole},
    },
    options,
  );
}

export function useDeleteRole(options) {
  return useAppMutation(
    {
      mutationFn: deleteRole,
      invalidates: ALL_QUERIES,
      meta: {touchPrincipal: holdsRole},
    },
    options,
  );
}

export function useMoveRole(options) {
  const queryClient = useQueryClient();
  return useAppMutation(
    {
      mutationFn: moveRole,
      invalidates: ALL_QUERIES,
      meta: {touchPrincipal: holdsRole},
      toast: false,
      onMutate: async ({id, direction}) => {
        await queryClient.cancelQueries({queryKey: roleKeys.lists()});
        const snapshot = queryClient.getQueriesData({
          queryKey: roleKeys.lists(),
        });
        for (const [queryKey, page] of snapshot) {
          if (!page?.items || isNarrowedQuery(queryKey.at(-1))) {
            continue;
          }
          queryClient.setQueryData(queryKey, {
            ...page,
            items: swapNeighbour(page.items, id, direction),
          });
        }
        return {snapshot};
      },
      onError: (error, variables, context) => {
        for (const [queryKey, data] of context?.snapshot ?? []) {
          queryClient.setQueryData(queryKey, data);
        }
      },
    },
    options,
  );
}
