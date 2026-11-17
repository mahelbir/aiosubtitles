'use client';

import {QueryBoundary} from '@/components/common/query-boundary';
import {useSettings} from '../api';
import {SettingsForm} from './settings-form';

export function SettingsPage() {
  const settingsQuery = useSettings();
  return (
    <QueryBoundary query={settingsQuery}>
      {settings => <SettingsForm settings={settings} />}
    </QueryBoundary>
  );
}
