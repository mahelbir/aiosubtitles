'use client';

import {Subscribe} from '@tanstack/react-table';
import {
  ChevronDownIcon,
  ChevronsUpDownIcon,
  ChevronUpIcon,
  EyeIcon,
  EyeOffIcon,
  ListPlusIcon,
  XIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function SortIcon({direction}) {
  if (direction === 'asc') {
    return <ChevronUpIcon />;
  }
  if (direction === 'desc') {
    return <ChevronDownIcon />;
  }
  return <ChevronsUpDownIcon className="opacity-50" />;
}

export function TableColumnHeader({header, children}) {
  const {table} = header.getContext();
  return (
    <Subscribe
      source={table.store}
      selector={state => ({
        sortCount: state.sorting.length,
        direction: header.column.getIsSorted(),
        sortIndex: header.column.getSortIndex(),
        hiddenCount: table
          .getAllColumns()
          .filter(item => item.getCanHide() && !item.getIsVisible()).length,
      })}
    >
      {selected => (
        <ColumnHeaderMenu header={header} {...selected}>
          {children}
        </ColumnHeaderMenu>
      )}
    </Subscribe>
  );
}

function ColumnHeaderMenu({
  header,
  sortCount,
  direction,
  sortIndex,
  hiddenCount,
  children,
}) {
  const {column} = header;
  const {table} = header.getContext();
  const canSort = column.getCanSort();
  const canHide = column.getCanHide();
  const isSorted = direction !== false;
  const isMultiSorted = isSorted && sortCount > 1;
  const canAppend = !isSorted && sortCount > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="-ms-1.5 inline-flex h-8 items-center gap-1.5 rounded-md px-2 hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none data-popup-open:bg-accent [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
        {children}
        {isMultiSorted && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {sortIndex + 1}
          </span>
        )}
        {canSort && <SortIcon direction={direction} />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {canSort && (
          <DropdownMenuGroup>
            <DropdownMenuCheckboxItem
              closeOnClick
              checked={direction === 'asc'}
              onClick={() => column.toggleSorting(false, false)}
            >
              <ChevronUpIcon />
              Ascending
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              closeOnClick
              checked={direction === 'desc'}
              onClick={() => column.toggleSorting(true, false)}
            >
              <ChevronDownIcon />
              Descending
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
        )}
        {canSort && canAppend && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => column.toggleSorting(false, true)}
              >
                <ListPlusIcon />
                Add as ascending
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => column.toggleSorting(true, true)}
              >
                <ListPlusIcon />
                Add as descending
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
        {canSort && isSorted && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => column.clearSorting()}>
                <XIcon />
                {isMultiSorted ? 'Remove from sort' : 'Clear sort'}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
        {canHide && canSort && <DropdownMenuSeparator />}
        {(canHide || hiddenCount > 0) && (
          <DropdownMenuGroup>
            {canHide && (
              <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                <EyeOffIcon />
                Hide column
              </DropdownMenuItem>
            )}
            {hiddenCount > 0 && (
              <DropdownMenuItem onClick={() => table.resetColumnVisibility()}>
                <EyeIcon />
                Show hidden columns ({hiddenCount})
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
