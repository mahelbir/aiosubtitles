'use client';

import {useMemo} from 'react';
import {parseAsArrayOf, parseAsString, useQueryStates} from 'nuqs';

const EMPTY_SCOPES = [];

const MONITOR_PARAMS = {
  scope: parseAsArrayOf(parseAsString).withDefault(EMPTY_SCOPES),
  source: parseAsString,
  title: parseAsString,
};

export function useMonitorParams() {
  const [{scope, source, title}] = useQueryStates(MONITOR_PARAMS);

  return useMemo(
    () => ({
      scopes: scope.map(value => value.trim()).filter(Boolean),
      source: source || null,
      title: title || null,
    }),
    [scope, source, title],
  );
}
