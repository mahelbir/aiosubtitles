import {keepPreviousData} from '@tanstack/react-query';
import {isSelf} from '@repo/shared/lib/authorization.js';
import {apiData, apiEnvelope} from '@/lib/api-client';
import {settleAll} from '@/lib/bulk';
import {useAppMutation, useAppQuery, useToastMutation} from '@/lib/query';

export const userKeys = {
  all: ['users'],
  lists: () => [...userKeys.all, 'list'],
  list: query => [...userKeys.lists(), query],
  details: () => [...userKeys.all, 'get'],
  get: id => [...userKeys.details(), id],
};

export function fetchUsers(options) {
  return apiData('/users', options);
}

export function fetchUser(id, options) {
  return apiData(`/users/${id}`, options);
}

export function createUser(values) {
  return apiEnvelope('/users', {method: 'POST', body: values});
}

export function updateUser(id, values) {
  return apiEnvelope(`/users/${id}`, {method: 'PATCH', body: values});
}

export function deleteUser(id) {
  return apiEnvelope(`/users/${id}`, {method: 'DELETE'});
}

export function deleteUsers(ids) {
  return settleAll(ids, deleteUser);
}

export function useUsers(query, options) {
  return useAppQuery(
    {
      queryKey: userKeys.list(query),
      queryFn: ({signal}) => fetchUsers({query, signal}),
      placeholderData: keepPreviousData,
    },
    options,
  );
}

export function useUser(id, options) {
  return useAppQuery(
    {
      queryKey: userKeys.get(id),
      queryFn: ({signal}) => fetchUser(id, {signal}),
      enabled: Boolean(id),
    },
    options,
  );
}

export function useCreateUser(options) {
  return useAppMutation(
    {isFormBound: true, mutationFn: createUser, invalidates: userKeys.all},
    options,
  );
}

export function useUpdateUser(options) {
  return useAppMutation(
    {
      isFormBound: true,
      mutationFn: ({id, values}) => updateUser(id, values),
      invalidates: userKeys.all,
      meta: {touchPrincipal: ({id}, principal) => isSelf(principal, {id})},
    },
    options,
  );
}

export function useDeleteUser(options) {
  return useAppMutation(
    {mutationFn: deleteUser, invalidates: userKeys.all},
    options,
  );
}

export function useDeleteUsers(options) {
  return useToastMutation(
    {
      mutationFn: deleteUsers,
      invalidates: userKeys.all,
      invalidateOn: 'settled',
    },
    options,
  );
}
