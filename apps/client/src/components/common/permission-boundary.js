'use client';

import {StatusCodes} from 'http-status-codes';
import {ErrorPage} from '@/components/common/error-page';
import {LinkButton} from '@/components/common/link-button';
import {Button} from '@/components/ui/button';
import {useAuthorization} from '@/hooks/use-authorization';
import {useLogout} from '@/api/auth';

function Forbidden() {
  const logoutMutation = useLogout();

  return (
    <ErrorPage
      code={StatusCodes.FORBIDDEN}
      title="Erişim engellendi!"
      message="Bu sayfayı görüntüleme yetkiniz yok."
      actions={
        <>
          <LinkButton variant="secondary" href="/">
            Ana sayfaya dön
          </LinkButton>
          <Button
            variant="secondary"
            disabled={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
          >
            Çıkış yap
          </Button>
        </>
      }
    />
  );
}

export function PermissionBoundary({
  fallback = <Forbidden />,
  children,
  ...criteria
}) {
  const {can, permissions} = useAuthorization();

  if (!permissions) {
    return children;
  }

  return can(criteria) ? children : fallback;
}
