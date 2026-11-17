'use client';

import {Permission} from '@repo/shared/constants/permission.js';
import {Button} from '@/components/ui/button';
import {PermissionBoundary} from '@/components/common/permission-boundary';
import {RequirePermission} from '@/components/common/require-permission';
import {useAuthStore} from '@/stores/auth-store';
import {fetchFixtureRecord} from '../api';
import {usePromiseStates} from '../hooks/use-promise-states';
import {FixtureSection} from './fixture-section';
import {FixtureState} from './fixture-state';

export function RequireSessionFixture() {
  const principal = useAuthStore(state => state.principal);
  const [requests, track] = usePromiseStates();

  return (
    <>
      <FixtureSection title="Oturum içeriği">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => track('record', fetchFixtureRecord())}
          >
            Kaydı getir
          </Button>
          <RequirePermission permission={Permission.USER_MANAGE_PEER}>
            <Button variant="outline">Kullanıcıları yönet</Button>
          </RequirePermission>
        </div>
      </FixtureSection>
      <FixtureSection title="Yönetim bölümü">
        <PermissionBoundary permission={Permission.ADMIN}>
          <p>Yönetim içeriği.</p>
        </PermissionBoundary>
      </FixtureSection>
      <FixtureState value={{principal, requests}} />
    </>
  );
}
