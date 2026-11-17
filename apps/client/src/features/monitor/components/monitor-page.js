'use client';

import {ErrorAlert} from '@/components/common/status-alerts.js';
import {useMonitorParams} from '../hooks/use-monitor-params';
import {MonitorBoard} from './monitor-board';

export function MonitorPage() {
  const {scopes, source, title} = useMonitorParams();

  if (!scopes.length) {
    return <ErrorAlert>Kapsam belirtilmedi.</ErrorAlert>;
  }

  return (
    <MonitorBoard
      key={`${source ?? ''}#${scopes.join(',')}`}
      scopes={scopes}
      source={source}
      title={title}
    />
  );
}
