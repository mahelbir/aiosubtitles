import {apiData, apiEnvelope} from '@/lib/api-client';
import {useAppMutation, useAppQuery} from '@/lib/query';

export const profileKeys = {
  all: ['profile'],
};

export function fetchProfile(options) {
  return apiData('/users/me', options);
}

export function updateProfile(values) {
  return apiEnvelope('/users/me', {method: 'PATCH', body: values});
}

export function changePassword(values) {
  return apiEnvelope('/users/me/password', {method: 'PATCH', body: values});
}

export function useProfile(options) {
  return useAppQuery(
    {
      queryKey: profileKeys.all,
      queryFn: ({signal}) => fetchProfile({signal}),
    },
    options,
  );
}

export function useUpdateProfile(options) {
  return useAppMutation(
    {
      isFormBound: true,
      mutationFn: updateProfile,
      invalidates: profileKeys.all,
      meta: {touchPrincipal: true},
    },
    options,
  );
}

export function useChangePassword(options) {
  return useAppMutation(
    {isFormBound: true, mutationFn: changePassword},
    options,
  );
}
