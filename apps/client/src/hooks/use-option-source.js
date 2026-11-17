'use client';

import {useState} from 'react';
import {keepPreviousData, skipToken} from '@tanstack/react-query';
import {useDebounce} from '@reactuses/core';
import {chunk, noop, uniq, uniqBy} from 'es-toolkit';
import {
  MAX_FILTER_VALUES,
  MAX_PAGE_SIZE,
} from '@repo/shared/constants/pagination.js';
import {SEARCHABLE_THRESHOLD, SEARCH_DEBOUNCE_MS} from '@/config/search';
import {useOptionFilter} from '@/hooks/use-option-filter';
import {
  OPTIONS_EMPTY_MESSAGE,
  OPTIONS_FAILURE_MESSAGE,
  OPTION_PAGE_SIZE,
} from '@/lib/option-source';
import {useOptionsInfiniteQuery, useOptionsQuery} from '@/lib/query';
import {toSearchTerm} from '@/lib/search';
import {LOADING_LABEL} from '@/components/common/loading-status';

const SEARCHING_MESSAGE = 'Aranıyor…';
const LOADING_MESSAGE = `${LOADING_LABEL}…`;
const EMPTY_LIST = [];
const IDLE_KEY = ['option-source'];
const WHOLE_LIST_KINDS = new Set(['fixed', 'preloaded']);
const EMPTY_RESOLUTION = {options: EMPTY_LIST, checkedKeys: EMPTY_LIST};
const UNPAGED = {
  labelSources: EMPTY_LIST,
  isRemote: false,
  canLookUp: false,
  isSearching: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: noop,
};

function getOptionKey(option) {
  return String(option.value);
}

function getEmptyMessage(hasFailed) {
  return hasFailed ? OPTIONS_FAILURE_MESSAGE : OPTIONS_EMPTY_MESSAGE;
}

function toOptions(pages, toOption) {
  return pages.flatMap(page => page.items.map(toOption));
}

function selectTotal(data) {
  return data.pages[0].meta.totalItemCount;
}

function getPageQuery({queryKey = IDLE_KEY, fetchPage}, term) {
  return {
    queryKey: [...queryKey, 'search', term],
    queryFn: ({pageParam, signal}) =>
      fetchPage(
        {
          pageNumber: pageParam,
          pageSize: OPTION_PAGE_SIZE,
          ...(term && {search: term}),
        },
        {signal},
      ),
    initialPageParam: 1,
    getNextPageParam: page => page.links.next ?? undefined,
  };
}

function useWholeList(source) {
  const isPreloaded = source.kind === 'preloaded';
  const query = useOptionsQuery(
    isPreloaded
      ? source.queryOptions
      : {queryKey: IDLE_KEY, queryFn: skipToken},
  );
  const options = (isPreloaded ? query.data : source.options) ?? EMPTY_LIST;
  return {
    options,
    total: options.length,
    matchTotal: options.length,
    isPending: isPreloaded && query.isPending,
    hasFailed: query.isError,
  };
}

function usePagedList(source, search) {
  const isRemoteKind = source.kind === 'remote';
  const preloadQuery = useOptionsQuery({
    queryKey: [...(source.queryKey ?? IDLE_KEY), 'preloaded'],
    queryFn: ({signal}) =>
      source.fetchPage({pageNumber: 1, pageSize: MAX_PAGE_SIZE}, {signal}),
    enabled: source.kind === 'preloadedPages',
  });
  const preloadedTotal = preloadQuery.data?.meta.totalItemCount;
  const isRemote = isRemoteKind || preloadedTotal > MAX_PAGE_SIZE;
  const term = toSearchTerm(useDebounce(search, SEARCH_DEBOUNCE_MS));
  const pageQuery = useOptionsInfiniteQuery({
    ...getPageQuery(source, term),
    enabled: isRemote,
    placeholderData: keepPreviousData,
  });
  const totalQuery = useOptionsInfiniteQuery({
    ...getPageQuery(source, ''),
    enabled: isRemoteKind,
    select: selectTotal,
  });
  const preloaded = preloadQuery.data
    ? toOptions([preloadQuery.data], source.toOption)
    : EMPTY_LIST;
  const total = (isRemoteKind ? totalQuery.data : preloadedTotal) ?? 0;

  if (!isRemote) {
    return {
      ...UNPAGED,
      options: preloaded,
      total,
      matchTotal: total,
      isPending: preloadQuery.isPending,
      hasFailed: preloadQuery.isError,
    };
  }
  const hasFailed = preloadQuery.isError || pageQuery.isError;
  const hasNextPage = !hasFailed && pageQuery.hasNextPage;
  return {
    options: pageQuery.data
      ? toOptions(pageQuery.data.pages, source.toOption)
      : EMPTY_LIST,
    labelSources: preloaded,
    total,
    matchTotal: pageQuery.data ? selectTotal(pageQuery.data) : 0,
    isRemote,
    canLookUp: !pageQuery.isPending,
    isPending:
      pageQuery.isPending ||
      pageQuery.isPlaceholderData ||
      toSearchTerm(search) !== term,
    isSearching: toSearchTerm(search) !== '' || term !== '',
    hasFailed,
    hasNextPage,
    isFetchingNextPage: pageQuery.isFetchingNextPage,
    fetchNextPage: () => {
      if (hasNextPage && !pageQuery.isFetching) {
        pageQuery.fetchNextPage();
      }
    },
  };
}

function useSelectedOptions(source, {selected, candidates, canLookUp}) {
  const [resolution, setResolution] = useState(EMPTY_RESOLUTION);
  const selectedKeys = new Set(selected.map(String));
  const resolvedKeys = new Set(resolution.options.map(getOptionKey));
  const knownKeys = new Set([
    ...resolution.checkedKeys,
    ...candidates.map(getOptionKey),
  ]);
  const missingIds = canLookUp
    ? uniq(selected)
        .filter(value => !knownKeys.has(String(value)))
        .toSorted()
    : EMPTY_LIST;
  const lookupQuery = useOptionsQuery({
    queryKey: [...(source.queryKey ?? IDLE_KEY), 'ids', missingIds],
    queryFn: ({signal}) =>
      Promise.all(
        chunk(missingIds, MAX_FILTER_VALUES).map(group =>
          source.fetchPage(
            {pageNumber: 1, pageSize: group.length, id: group},
            {signal},
          ),
        ),
      ),
    enabled: missingIds.length > 0,
  });
  const checkedIds = lookupQuery.isSuccess ? missingIds : EMPTY_LIST;
  const found = lookupQuery.isSuccess
    ? [...candidates, ...toOptions(lookupQuery.data, source.toOption)]
    : candidates;
  const fresh = uniqBy(
    found.filter(
      option =>
        selectedKeys.has(getOptionKey(option)) &&
        !resolvedKeys.has(getOptionKey(option)),
    ),
    getOptionKey,
  );
  if (fresh.length > 0 || checkedIds.length > 0) {
    setResolution({
      options: [...resolution.options, ...fresh],
      checkedKeys: [...resolution.checkedKeys, ...checkedIds.map(String)],
    });
  }
  return resolution.options.filter(option =>
    selectedKeys.has(getOptionKey(option)),
  );
}

/**
 * @param {import('@/lib/option-source').OptionSource} source
 * @returns {{known: import('@/lib/option-source').Option[], listed: import('@/lib/option-source').Option[], isPending: boolean, pendingMessage: string, hasFailed: boolean, emptyMessage: string}}
 */
export function useWholeOptionList(source) {
  if (!WHOLE_LIST_KINDS.has(source.kind)) {
    throw new Error('This control needs a source that loads the whole list.');
  }
  const {options, isPending, hasFailed} = useWholeList(source);
  return {
    known: options,
    listed: hasFailed ? EMPTY_LIST : options,
    isPending,
    pendingMessage: LOADING_MESSAGE,
    hasFailed,
    emptyMessage: getEmptyMessage(hasFailed),
  };
}

/**
 * @param {import('@/lib/option-source').OptionSource} source
 * @param {Object} [options]
 * @param {string} [options.search]
 * @param {Array} [options.selected]
 * @param {import('@/lib/option-source').Option[]} [options.knownOptions]
 * @returns {{known: import('@/lib/option-source').Option[], listed: import('@/lib/option-source').Option[], filter: Function|null, labelOf: (value: *) => string, total: number, matchTotal: number, isSearchable: boolean, isPending: boolean, pendingMessage: string, hasFailed: boolean, emptyMessage: string, hasNextPage: boolean, isFetchingNextPage: boolean, fetchNextPage: () => void}}
 */
export function useOptionSource(
  source,
  {search = '', selected = EMPTY_LIST, knownOptions = EMPTY_LIST} = {},
) {
  const whole = useWholeList(source);
  const paged = usePagedList(source, search);
  const {contains} = useOptionFilter();
  const list = WHOLE_LIST_KINDS.has(source.kind)
    ? {...UNPAGED, ...whole}
    : paged;
  const selectedOptions = useSelectedOptions(source, {
    selected,
    candidates: [...list.options, ...list.labelSources, ...knownOptions],
    canLookUp: list.canLookUp,
  });
  const known = uniqBy(
    [...list.options, ...selectedOptions, ...knownOptions],
    getOptionKey,
  );
  const labels = new Map(
    known.map(option => [getOptionKey(option), option.label]),
  );

  return {
    known,
    listed: list.hasFailed ? EMPTY_LIST : list.options,
    filter: list.isRemote ? null : contains,
    labelOf: value => labels.get(String(value)) ?? String(value ?? ''),
    total: list.total,
    matchTotal: list.matchTotal,
    isSearchable: list.total > SEARCHABLE_THRESHOLD,
    isPending: list.isPending,
    pendingMessage: list.isSearching ? SEARCHING_MESSAGE : LOADING_MESSAGE,
    hasFailed: list.hasFailed,
    emptyMessage: getEmptyMessage(list.hasFailed),
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
    fetchNextPage: list.fetchNextPage,
  };
}
