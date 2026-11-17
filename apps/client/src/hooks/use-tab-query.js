'use client';

import {useMemo} from 'react';
import {parseAsString, parseAsStringLiteral, useQueryStates} from 'nuqs';

const NO_RESET_KEYS = [];

export function useTabQuery(items, {resetKeys = NO_RESET_KEYS} = {}) {
  const parsers = useMemo(() => {
    const values = items.map(item => item.value);
    return {
      tab: parseAsStringLiteral(values).withDefault(values[0]),
      ...Object.fromEntries(resetKeys.map(key => [key, parseAsString])),
    };
  }, [items, resetKeys]);
  const [{tab}, setQuery] = useQueryStates(parsers);
  const setTab = value =>
    setQuery({
      tab: value,
      ...Object.fromEntries(resetKeys.map(key => [key, null])),
    });
  return [tab, setTab];
}
