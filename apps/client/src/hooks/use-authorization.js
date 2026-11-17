'use client';

import {useMemo} from 'react';
import {
  canGrant,
  getMaxManageablePosition,
  hasAnyPermission,
  hasPermission,
  hasPermissions,
} from '@repo/shared/lib/authorization.js';
import {useAuthStore} from '@/stores/auth-store';

export function useAuthorization() {
  const principalPermissions = useAuthStore(
    state => state.principal?.permissions,
  );
  const principalRoles = useAuthStore(state => state.principal?.roles);
  return useMemo(
    () => ({
      permissions: principalPermissions,
      roles: principalRoles,
      maxManageablePosition: getMaxManageablePosition({
        permissions: principalPermissions,
        roles: principalRoles,
      }),
      can: (criteria = {}) => {
        const {permission, permissions, anyPermission, grant} = criteria;
        if (permission) {
          return hasPermission(principalPermissions, permission);
        }
        if (permissions) {
          return hasPermissions(principalPermissions, permissions);
        }
        if (anyPermission) {
          return hasAnyPermission(principalPermissions, anyPermission);
        }
        if (grant) {
          return canGrant({permissions: principalPermissions}, grant);
        }
        return Object.keys(criteria).length === 0;
      },
    }),
    [principalPermissions, principalRoles],
  );
}
