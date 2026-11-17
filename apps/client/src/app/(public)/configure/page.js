import {Suspense} from 'react';
import {PageLoader} from '@/components/common/page-loader';
import {ConfigurePlaceholder} from '@/features/configure/components/configure-placeholder';

export const metadata = {
  title: 'Configure',
};

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ConfigurePlaceholder />
    </Suspense>
  );
}
