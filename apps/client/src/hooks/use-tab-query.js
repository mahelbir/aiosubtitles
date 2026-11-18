'use client';

import {useMemo} from 'react';
import {parseAsString, parseAsStringLiteral, useQueryStates} from 'nuqs';

const NO_RESET_KEYS = [];

export function useTabQuery(
  items,
  {resetKeys = NO_RESET_KEYS, urlKey = 'tab'} = {},
) {
  const parsers = useMemo(() => {
    const values = items.map(item => item.value);
    return {
      [urlKey]: parseAsStringLiteral(values).withDefault(values[0]),
      ...Object.fromEntries(resetKeys.map(key => [key, parseAsString])),
    };
  }, [items, resetKeys, urlKey]);
  const [query, setQuery] = useQueryStates(parsers);
  const setTab = value =>
    setQuery({
      [urlKey]: value,
      ...Object.fromEntries(resetKeys.map(key => [key, null])),
    });
  return [query[urlKey], setTab];
}
