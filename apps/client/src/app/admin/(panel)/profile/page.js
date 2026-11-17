import {Suspense} from 'react';
import {PageLoader} from '@/components/common/page-loader';
import {ProfilePage} from '@/features/profile/components/profile-page';

export const metadata = {
  title: 'Profil',
};

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ProfilePage />
    </Suspense>
  );
}
