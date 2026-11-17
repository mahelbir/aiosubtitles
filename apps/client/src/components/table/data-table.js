'use client';

import {Fragment} from 'react';
import {FlexRender, Subscribe} from '@tanstack/react-table';
import {cn} from 'cn';
import {hasBlockingError} from '@/lib/query';
import {NoRecords} from '@/components/common/no-records';
import {OfflineEmpty} from '@/components/common/offline-notice';
import {QueryErrorAlert} from '@/components/common/query-boundary';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {Skeleton} from '@/components/ui/skeleton';
import {TableColumnHeader} from './table-column-header';
import {StaticTableProvider, useTableContext} from './table-provider';

const ARIA_SORT = {asc: 'ascending', desc: 'descending'};
const MAX_SKELETON_ROWS = 10;
const BODY_ROW_VARIANT = {
  default: 'body',
  subtle: 'subtle',
};

function cellClass(column, isOverflowing) {
  const meta = column.columnDef.meta;
  return cn(
    meta?.className,
    meta?.pinned && isOverflowing && 'sticky end-0 z-10 border-s bg-inherit',
  );
}

function TableView({emptyAction, renderExpandedRow, getRowVariant}) {
  const {table, list, query, flashedId, boxRef, contentRef, isOverflowing} =
    useTableContext();
  const rows = table.getRowModel().rows;
  const columns = table.getVisibleLeafColumns();
  const isRefreshing = Boolean(query?.isFetching);
  const isShowingPrevious = Boolean(query?.isPlaceholderData);
  const isPaused = query?.fetchStatus === 'paused';
  const isPending = Boolean(query?.isPending);
  const isOffline = isPending && isPaused;
  const isEmpty = !isPending && rows.length === 0;
  const skeletonRows = Array.from(
    {
      length: Math.min(
        list?.query?.pageSize ?? MAX_SKELETON_ROWS,
        MAX_SKELETON_ROWS,
      ),
    },
    (unused, index) => index,
  );

  if (hasBlockingError(query)) {
    return <QueryErrorAlert query={query} />;
  }

  return (
    <div
      ref={boxRef}
      aria-busy={isRefreshing}
      className={cn(
        'overflow-hidden rounded-lg border',
        isPending && 'pending-reveal',
      )}
    >
      <Table
        ref={contentRef}
        containerClassName={cn(renderExpandedRow && '@container')}
      >
        <TableHeader>
          {table.getHeaderGroups().map(headerGroup => (
            <TableRow key={headerGroup.id} variant="header">
              {headerGroup.headers.map(header => {
                const hasMenu =
                  header.column.getCanSort() || header.column.getCanHide();
                return (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    className={cellClass(header.column, isOverflowing)}
                    aria-sort={ARIA_SORT[header.column.getIsSorted()]}
                  >
                    {header.isPlaceholder ? null : hasMenu ? (
                      <TableColumnHeader header={header}>
                        <FlexRender header={header} />
                      </TableColumnHeader>
                    ) : (
                      <FlexRender header={header} />
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isPending && !isPaused
            ? skeletonRows.map(index => (
                <TableRow key={index} variant="placeholder">
                  {columns.map(column => (
                    <TableCell
                      key={column.id}
                      className={cellClass(column, isOverflowing)}
                    >
                      <Skeleton
                        className={cn(
                          'h-4 w-full',
                          column.columnDef.meta?.skeleton,
                        )}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : rows.map(row => (
                <Fragment key={row.id}>
                  <Subscribe
                    source={table.atoms.rowSelection}
                    selector={() => row.getIsSelected()}
                  >
                    {isSelected => (
                      <TableRow
                        data-state={isSelected ? 'selected' : undefined}
                        variant={
                          flashedId === row.id
                            ? 'flash'
                            : (BODY_ROW_VARIANT[getRowVariant?.(row)] ??
                              BODY_ROW_VARIANT.default)
                        }
                        className={cn(
                          isShowingPrevious && 'opacity-60 transition-opacity',
                        )}
                      >
                        {row.getVisibleCells().map(cell => (
                          <TableCell
                            key={cell.id}
                            className={cellClass(cell.column, isOverflowing)}
                          >
                            <FlexRender cell={cell} />
                          </TableCell>
                        ))}
                      </TableRow>
                    )}
                  </Subscribe>
                  {renderExpandedRow ? (
                    <Subscribe
                      source={table.atoms.expanded}
                      selector={() => row.getIsExpanded()}
                    >
                      {isExpanded =>
                        isExpanded ? (
                          <TableRow variant="detail">
                            <TableCell colSpan={columns.length} className="p-0">
                              <div className="sticky start-0 w-container whitespace-normal transition-opacity duration-250 starting:opacity-0">
                                {renderExpandedRow(row)}
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null
                      }
                    </Subscribe>
                  ) : null}
                </Fragment>
              ))}
        </TableBody>
      </Table>
      {isOffline && <OfflineEmpty />}
      {isEmpty && <NoRecords action={emptyAction} />}
    </div>
  );
}

export function DataTable({emptyAction, renderExpandedRow, getRowVariant}) {
  return (
    <TableView
      emptyAction={emptyAction}
      renderExpandedRow={renderExpandedRow}
      getRowVariant={getRowVariant}
    />
  );
}

export function StaticDataTable({columns, data, emptyAction, getRowVariant}) {
  return (
    <StaticTableProvider data={data} columns={columns}>
      <TableView emptyAction={emptyAction} getRowVariant={getRowVariant} />
    </StaticTableProvider>
  );
}
