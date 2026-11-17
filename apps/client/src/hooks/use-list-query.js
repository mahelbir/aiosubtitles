'use client';

import {useMemo, useState} from 'react';
import {usePathname, useSearchParams} from 'next/navigation';
import {
  createParser,
  createSerializer,
  parseAsArrayOf,
  parseAsNumberLiteral,
  parseAsString,
  useQueryStates,
} from 'nuqs';
import {mapValues, uniq} from 'es-toolkit';
import {useDebounceFn} from '@reactuses/core';
import {
  DEFAULT_PAGE_NUMBER,
  DEFAULT_PAGE_SIZE,
} from '@repo/shared/constants/pagination.js';
import {getOffsetPaginationSchema} from '@repo/shared/schemas/pagination.js';
import {DEFAULT_WINDOW_SIZE, PAGE_SIZE_OPTIONS} from '@/config/pagination';
import {SEARCH_DEBOUNCE_MS} from '@/config/search';
import {toSearchTerm} from '@/lib/search';
import {queryToSorting, sortingToQuery} from '@/lib/table';

const pageNumberField = getOffsetPaginationSchema().shape.pageNumber;

const baseParsers = {
  pageNumber: createParser({
    parse: raw => pageNumberField.safeParse(raw).data ?? null,
    serialize: String,
  }).withDefault(DEFAULT_PAGE_NUMBER),
  search: parseAsString.withDefault(''),
  sort: parseAsArrayOf(parseAsString).withDefault([]),
};

function isParser(filter) {
  return typeof filter?.parse === 'function';
}

function filterParser(filter) {
  if (isParser(filter)) {
    return filter;
  }
  if (filter.parser) {
    return filter.parser;
  }
  if (!filter.source?.options) {
    throw new Error('A filter without a fixed source needs a parser.');
  }
  const values = filter.source.options.map(option => option.value);
  return parseAsArrayOf(
    createParser({
      parse: raw => values.find(value => String(value) === raw) ?? null,
      serialize: String,
    }),
  );
}

const EMPTY_SORT = [];

function keepSortable(rawSort, sortable) {
  if (!sortable?.length) {
    return EMPTY_SORT;
  }
  const kept = rawSort.filter(field =>
    sortable.includes(field.replace(/^-/, '')),
  );
  return kept.length === rawSort.length ? rawSort : kept;
}

function isFilterSet(value) {
  if (value === null || value === undefined || value === '') {
    return false;
  }
  return Array.isArray(value) ? value.length > 0 : true;
}

const WINDOW_KEYS = new Set(['pageNumber', 'pageSize', 'sort', 'windowSize']);

export function isNarrowedQuery(query) {
  return Object.entries(query ?? {}).some(
    ([key, value]) => !WINDOW_KEYS.has(key) && isFilterSet(value),
  );
}

function getQueryParsers({
  filterParsers,
  sizes = PAGE_SIZE_OPTIONS,
  defaultPageSize = DEFAULT_PAGE_SIZE,
}) {
  return {
    ...baseParsers,
    pageSize: parseAsNumberLiteral(sizes).withDefault(defaultPageSize),
    ...filterParsers,
  };
}

export function getListQueryKeys(filters = {}) {
  return Object.keys(
    getQueryParsers({filterParsers: mapValues(filters, filterParser)}),
  );
}

export function useListQuery({
  filters = {},
  sortable = [],
  defaultPageSize = DEFAULT_PAGE_SIZE,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  windowSize = DEFAULT_WINDOW_SIZE,
} = {}) {
  const sizes = useMemo(
    () => uniq([...pageSizeOptions, defaultPageSize]).sort((a, b) => a - b),
    [pageSizeOptions, defaultPageSize],
  );
  const parsers = useMemo(() => mapValues(filters, filterParser), [filters]);
  const queryParsers = getQueryParsers({
    filterParsers: parsers,
    sizes,
    defaultPageSize,
  });
  const [rawQuery, setQuery] = useQueryStates(queryParsers);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawSort = rawQuery.sort;
  const sort = useMemo(
    () => keepSortable(rawSort, sortable),
    [rawSort, sortable],
  );
  const query = useMemo(
    () => ({...rawQuery, sort, windowSize}),
    [rawQuery, sort, windowSize],
  );
  const filterKeys = Object.keys(filters);
  const {search} = query;
  const [searchInput, setSearchInputState] = useState(search);
  const [prevSearch, setPrevSearch] = useState(search);
  if (search !== prevSearch) {
    setPrevSearch(search);
    if (search !== toSearchTerm(searchInput)) {
      setSearchInputState(search);
    }
  }

  const {run: commitSearch} = useDebounceFn(async () => {
    const nextSearch = toSearchTerm(searchInput);
    if (nextSearch !== search) {
      await setQuery({search: nextSearch || null, pageNumber: null});
    }
  }, SEARCH_DEBOUNCE_MS);

  const setSearchInput = value => {
    setSearchInputState(value);
    commitSearch();
  };

  const sorting = useMemo(() => queryToSorting(sort), [sort]);

  const setFilter = values => setQuery({...values, pageNumber: null});

  const isFiltered = isNarrowedQuery(query);

  const resetFilters = async () => {
    setSearchInputState('');
    await setQuery({
      search: null,
      pageNumber: null,
      ...Object.fromEntries(filterKeys.map(key => [key, null])),
    });
  };

  const onSortingChange = updater =>
    setQuery(prev => {
      const next =
        typeof updater === 'function'
          ? updater(queryToSorting(keepSortable(prev.sort, sortable)))
          : updater;
      const nextSort = sortingToQuery(next);
      return {sort: nextSort.length ? nextSort : null, pageNumber: null};
    });

  const toPageQuery = page => ({
    pageNumber: page === DEFAULT_PAGE_NUMBER ? null : page,
  });

  const onPageChange = page => setQuery(toPageQuery(page));

  const pageHref = page =>
    createSerializer(queryParsers)(
      `${pathname}?${searchParams}`,
      toPageQuery(page),
    );

  const onPageSizeChange = size =>
    setQuery({
      pageSize: size === defaultPageSize ? null : size,
      pageNumber: null,
    });

  return {
    query,
    setQuery,
    setFilter,
    filters,
    sortable,
    pageSizeOptions: sizes,
    isFiltered,
    resetFilters,
    searchInput,
    setSearchInput,
    sorting,
    onSortingChange,
    onPageChange,
    pageHref,
    onPageSizeChange,
  };
}
