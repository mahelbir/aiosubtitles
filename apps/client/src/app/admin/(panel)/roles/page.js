import {Suspense} from 'react';
import {PageLoader} from '@/components/common/page-loader';
import {RolesPage} from '@/features/roles/components/roles-page';

export const metadata = {
  title: 'Roller',
};

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <RolesPage />
    </Suspense>
  );
}
