'use client';

import {Subscribe} from '@tanstack/react-table';
import {Checkbox} from '@/components/ui/checkbox';

export const selectionColumn = {
  id: 'select',
  enableSorting: false,
  enableHiding: false,
  meta: {className: 'w-0', skeleton: 'size-4 rounded-sm'},
  header: ({table}) => (
    <Subscribe
      source={table.atoms.rowSelection}
      selector={() => ({
        isAll: table.getIsAllPageRowsSelected(),
        isSome: table.getIsSomePageRowsSelected(),
        isNoneSelectable: !table
          .getRowModel()
          .rows.some(row => row.getCanSelect()),
      })}
    >
      {({isAll, isSome, isNoneSelectable}) => (
        <Checkbox
          variant="opaque"
          checked={isAll}
          indeterminate={isSome && !isAll}
          disabled={isNoneSelectable}
          onCheckedChange={checked => table.toggleAllPageRowsSelected(checked)}
          aria-label="Select all"
        />
      )}
    </Subscribe>
  ),
  cell: ({row}) => (
    <Subscribe
      source={row.table.atoms.rowSelection}
      selector={selection => Boolean(selection[row.id])}
    >
      {isSelected => (
        <Checkbox
          variant="opaque"
          checked={isSelected}
          disabled={!row.getCanSelect()}
          onCheckedChange={checked => row.toggleSelected(checked)}
          aria-label="Select row"
        />
      )}
    </Subscribe>
  ),
};
