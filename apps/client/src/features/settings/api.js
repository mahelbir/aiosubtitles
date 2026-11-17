import {useQueryClient} from '@tanstack/react-query';
import {apiData, apiEnvelope} from '@/lib/api-client';
import {useAppMutation, useAppQuery} from '@/lib/query';

export const settingKeys = {
  all: ['settings'],
};

export function fetchSettings(options) {
  return apiData('/settings', options);
}

export function updateSettings(values) {
  return apiEnvelope('/settings', {method: 'PATCH', body: values});
}

export function useSettings(options) {
  return useAppQuery(
    {
      queryKey: settingKeys.all,
      queryFn: ({signal}) => fetchSettings({signal}),
      refetchOnWindowFocus: true,
      refetchInterval: 10000,
    },
    options,
  );
}

export function useRefreshSettings() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.fetchQuery({
      queryKey: settingKeys.all,
      queryFn: ({signal}) => fetchSettings({signal}),
      staleTime: 0,
    });
}

export function useUpdateSettings(options) {
  const queryClient = useQueryClient();
  return useAppMutation(
    {
      isFormBound: true,
      mutationFn: updateSettings,
      onSuccess: async envelope => {
        await queryClient.cancelQueries({queryKey: settingKeys.all});
        queryClient.setQueryData(settingKeys.all, envelope.data);
      },
    },
    options,
  );
}
