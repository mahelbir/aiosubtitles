'use client';

import {XIcon} from 'lucide-react';
import {cn} from 'cn';
import {Button} from '@/components/ui/button';
import {TableFacetedFilter} from './table-faceted-filter';
import {useTableContext} from './table-provider';

export function TableToolbar({className, children}) {
  const {list} = useTableContext();
  const facets = Object.entries(list?.filters ?? {}).filter(
    ([, filter]) => filter?.title,
  );

  return (
    <div
      role="search"
      aria-label="Table filters"
      className={cn('flex w-full flex-wrap items-center gap-2', className)}
    >
      {children}
      {facets.map(([name, filter]) => (
        <TableFacetedFilter key={name} name={name} {...filter} />
      ))}
      {list?.isFiltered && (
        <Button
          variant="outline"
          className="border-dashed"
          onClick={list.resetFilters}
        >
          <XIcon data-icon="inline-start" />
          Clear
        </Button>
      )}
    </div>
  );
}
