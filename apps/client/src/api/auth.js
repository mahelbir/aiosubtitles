import {apiData} from '@/lib/api-client';
import {useAppMutation} from '@/lib/query';
import {refreshPrincipal} from '@/api/principal';
import {useAuthStore} from '@/stores/auth-store';

export function login(credentials) {
  return apiData('/auth/login', {method: 'POST', body: credentials});
}

export function useLogin(options) {
  return useAppMutation(
    {
      isFormBound: true,
      mutationFn: async credentials => {
        const session = await login(credentials);
        useAuthStore.getState().setSession(session);
        return refreshPrincipal();
      },
    },
    options,
  );
}

export function useLogout(options) {
  return useAppMutation(
    {
      mutationFn: async () => {
        await apiData('/auth/logout', {method: 'POST'}).catch(() => {});
        useAuthStore.getState().clearSession();
      },
    },
    options,
  );
}
