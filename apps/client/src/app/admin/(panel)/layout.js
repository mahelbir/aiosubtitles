'use client';

import {Permission} from '@repo/shared/constants/permission.js';
import {RequireSession} from '@/features/auth/components/require-session';
import {PermissionBoundary} from '@/components/common/permission-boundary';
import {AdminShell} from '@/components/layout/admin/admin-shell';

export default function PanelLayout({children}) {
  return (
    <RequireSession loginRoute="/admin/login">
      <PermissionBoundary permission={Permission.ADMIN}>
        <AdminShell>{children}</AdminShell>
      </PermissionBoundary>
    </RequireSession>
  );
}
