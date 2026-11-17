'use client';

import {AdminShell} from '@/components/layout/admin/admin-shell';
import {FixtureState} from './fixture-state';

export function AdminShellFixture() {
  return (
    <AdminShell>
      <FixtureState value={{}} />
    </AdminShell>
  );
}
