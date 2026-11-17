import {Suspense} from 'react';
import {PageLoader} from '@/components/common/page-loader';
import {UsersPage} from '@/features/users/components/users-page';

export const metadata = {
  title: 'Kullanıcılar',
};

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <UsersPage />
    </Suspense>
  );
}
