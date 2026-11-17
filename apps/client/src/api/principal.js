import {apiData} from '@/lib/api-client';
import {useAuthStore} from '@/stores/auth-store';

export function fetchPrincipal() {
  return apiData('/auth/me');
}

export async function refreshPrincipal() {
  const {refreshToken} = useAuthStore.getState();
  const principal = await fetchPrincipal();
  useAuthStore.getState().setPrincipal(refreshToken, principal);
  return principal;
}
