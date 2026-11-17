import {apiData} from '@/lib/api-client';
import {useAppQuery} from '@/lib/query';

export function fetchRemoteSocket(source, options) {
  return apiData(`/sockets/sources/${encodeURIComponent(source)}`, options);
}

export function useRemoteSocket(source, options) {
  return useAppQuery(
    {
      queryKey: ['sockets', 'remote', source],
      queryFn: ({signal}) => fetchRemoteSocket(source, {signal}),
      enabled: !!source,
      staleTime: Infinity,
    },
    options,
  );
}
