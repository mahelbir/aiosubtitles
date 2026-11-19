import {Suspense} from 'react';
import {PageLoader} from '@/components/common/page-loader';
import {ConfigurePage} from '@/features/configure/components/configure-page';

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ConfigurePage />
    </Suspense>
  );
}
