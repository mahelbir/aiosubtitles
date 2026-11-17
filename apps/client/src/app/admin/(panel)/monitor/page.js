import {Suspense} from 'react';
import {PageLoader} from '@/components/common/page-loader';
import {MonitorPage} from '@/features/monitor/components/monitor-page';

export const metadata = {
  title: 'Monitör',
};

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <MonitorPage />
    </Suspense>
  );
}
