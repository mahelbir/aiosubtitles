import {Suspense} from 'react';
import {PageLoader} from '@/components/common/page-loader';
import {SettingsPage} from '@/features/settings/components/settings-page';

export const metadata = {
  title: 'Ayarlar',
};

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <SettingsPage />
    </Suspense>
  );
}
