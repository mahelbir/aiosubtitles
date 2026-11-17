import {Suspense} from 'react';
import {PageLoader} from '@/components/common/page-loader';
import {LoginPage} from '@/features/auth/components/login-page';

export const metadata = {
  title: 'Giriş',
};

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <LoginPage nextRoute={'/admin/'} />
    </Suspense>
  );
}
