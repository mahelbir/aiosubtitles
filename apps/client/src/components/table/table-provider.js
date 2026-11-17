'use client';

import {createContext, use, useMemo, useState} from 'react';
import {
  columnVisibilityFeature,
  constructSortFn,
  createSortedRowModel,
  rowExpandingFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_basic,
  sortFn_datetime,
  tableFeatures,
  tableOptions,
  useTable,
} from '@tanstack/react-table';
import {useLocalStorage} from '@reactuses/core';
import {isEqual, isNil} from 'es-toolkit';
import {fnv1a} from 'melperjs';
import {useOverflow} from '@/hooks/use-overflow';
import {getIntlFormatter} from '@/lib/intl';
import {selectionColumn} from './selection-column';

const TableContext = createContext(null);
const EMPTY_ITEMS = [];
const EMPTY_VISIBILITY = {};
const EMPTY_SELECTION = {};
const EMPTY_EXPANDED = {};
const EMPTY_SORTING = [];
const DEFAULT_ROW_ID = 'id';
const alwaysExpandable = () => true;
const TEXT_COLLATION = {numeric: true, sensitivity: 'base'};
const textCollator = getIntlFormatter(Intl.Collator, TEXT_COLLATION);

const localeTextSortFn = constructSortFn({
  resolveDataValue: value => (isNil(value) ? '' : String(value)),
  sort: textCollator.compare,
});

export const tableKitFeatures = tableFeatures({
  columnVisibilityFeature,
  rowExpandingFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: localeTextSortFn,
    text: localeTextSortFn,
    datetime: sortFn_datetime,
    basic: sortFn_basic,
  },
});

const baseOptions = tableOptions({
  features: tableKitFeatures,
  sortDescFirst: false,
});

function rowIdReader(rowId) {
  return typeof rowId === 'function' ? rowId : row => row[rowId];
}

function rowIdResolver(readRowId) {
  return (row, index) => {
    const value = readRowId(row);
    return value === undefined || value === null
      ? String(index)
      : String(value);
  };
}

function storageKey(id, columns) {
  if (id) {
    return `table:${id}:columns`;
  }
  const source = columns
    .map(column => column.id ?? column.accessorKey ?? '?')
    .join('|');
  return `table:${fnv1a(source)}:columns`;
}

function useTableInstance(options, columnVisibility, onColumnVisibilityChange) {
  return useTable({
    ...baseOptions,
    ...options,
    state: {...options.state, columnVisibility},
    onColumnVisibilityChange,
  });
}

function ListTableProvider({
  id,
  list,
  query,
  columns,
  enableRowSelection,
  rowId = DEFAULT_ROW_ID,
  flashedId = null,
  children,
}) {
  const key = useMemo(() => storageKey(id, columns), [id, columns]);
  const [stored, setStored] = useLocalStorage(key, EMPTY_VISIBILITY);
  const [rowSelection, setRowSelection] = useState(EMPTY_SELECTION);
  const [expanded, setExpanded] = useState(EMPTY_EXPANDED);
  const [rowStateQuery, setRowStateQuery] = useState(list.query);
  if (!isEqual(rowStateQuery, list.query)) {
    setRowStateQuery(list.query);
    setRowSelection(EMPTY_SELECTION);
    setExpanded(EMPTY_EXPANDED);
  }
  const columnVisibility = stored ?? EMPTY_VISIBILITY;
  const {boxRef, contentRef, isOverflowing} = useOverflow();
  const readRowId = useMemo(() => rowIdReader(rowId), [rowId]);
  const getRowId = useMemo(() => rowIdResolver(readRowId), [readRowId]);
  const table = useTableInstance(
    {
      columns,
      data: query.data?.items ?? EMPTY_ITEMS,
      state: {sorting: list.sorting, rowSelection, expanded},
      onSortingChange: list.onSortingChange,
      onRowSelectionChange: setRowSelection,
      onExpandedChange: setExpanded,
      autoResetExpanded: false,
      getRowCanExpand: alwaysExpandable,
      getRowId,
      enableRowSelection,
      enableSorting: Boolean(list.sortable?.length),
      manualSorting: true,
    },
    columnVisibility,
    updater =>
      setStored(current =>
        typeof updater === 'function'
          ? updater(current ?? EMPTY_VISIBILITY)
          : updater,
      ),
  );

  return (
    <TableContext.Provider
      value={{
        list,
        query,
        table,
        readRowId,
        flashedId,
        boxRef,
        contentRef,
        isOverflowing,
      }}
    >
      {children}
    </TableContext.Provider>
  );
}

export function TableProvider(props) {
  return <ListTableProvider {...props} enableRowSelection={false} />;
}

export function SelectableTableProvider({
  columns,
  enableRowSelection = true,
  ...props
}) {
  const tableColumns = useMemo(() => [selectionColumn, ...columns], [columns]);

  return (
    <ListTableProvider
      {...props}
      columns={tableColumns}
      enableRowSelection={enableRowSelection}
    />
  );
}

export function StaticTableProvider({
  data,
  columns,
  rowId = DEFAULT_ROW_ID,
  children,
}) {
  const [columnVisibility, setColumnVisibility] = useState(EMPTY_VISIBILITY);
  const [sorting, setSorting] = useState(EMPTY_SORTING);
  const {boxRef, contentRef, isOverflowing} = useOverflow();
  const readRowId = useMemo(() => rowIdReader(rowId), [rowId]);
  const getRowId = useMemo(() => rowIdResolver(readRowId), [readRowId]);
  const table = useTableInstance(
    {
      data,
      columns,
      state: {sorting},
      onSortingChange: setSorting,
      enableSorting: true,
      getRowId,
    },
    columnVisibility,
    setColumnVisibility,
  );

  return (
    <TableContext.Provider
      value={{
        list: null,
        query: null,
        table,
        readRowId,
        flashedId: null,
        boxRef,
        contentRef,
        isOverflowing,
      }}
    >
      {children}
    </TableContext.Provider>
  );
}

export function useTableContext() {
  return use(TableContext);
}
