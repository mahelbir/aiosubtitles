'use client';

import {apiData} from '@/lib/api-client';
import {optionSource} from '@/lib/option-source';
import {useOptionsQuery} from '@/lib/query';

export const roleOptionKeys = {
  all: ['role-options'],
};

export function toRoleOption(role) {
  return {value: role.id, label: role.label};
}

const selectRoleOptions = roles => roles.map(toRoleOption);

export function fetchRoleOptions(options) {
  return apiData('/roles/options', options);
}

export const roleOptionSource = optionSource.preloaded({
  queryKey: roleOptionKeys.all,
  queryFn: ({signal}) => fetchRoleOptions({signal}),
  select: selectRoleOptions,
});

export function useRoleOptions(options) {
  return useOptionsQuery(roleOptionSource.queryOptions, options);
}
