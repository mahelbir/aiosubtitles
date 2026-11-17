'use client';

import {CalendarRangeIcon} from 'lucide-react';
import {DateRangeFields} from '@/components/common/date-range-fields';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {Separator} from '@/components/ui/separator';
import {
  endOfDayUtc,
  formatDateInputRange,
  startOfDayUtc,
  toDateInput,
} from '@/lib/datetime';
import {FilterClear} from './filter-clear';
import {useTableContext} from './table-provider';

function RangeFilterControl({title, from, to, isActive, onRange}) {
  const reset = () => onRange({from: '', to: ''});

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="outline" className="border-dashed" />}
      >
        {isActive ? (
          <FilterClear title={title} onReset={reset} />
        ) : (
          <CalendarRangeIcon data-icon="inline-start" />
        )}
        {title}
        {isActive && (
          <>
            <Separator
              orientation="vertical"
              className="mx-0.5 data-vertical:h-4"
            />
            <Badge
              variant="secondary"
              className="rounded-sm px-1"
              suppressHydrationWarning
            >
              {formatDateInputRange(from, to)}
            </Badge>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto">
        <DateRangeFields from={from} to={to} onRange={onRange} />
        {isActive && (
          <Button variant="ghost" size="sm" onClick={reset}>
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function TableDateRangeFilter({fromName, toName, title}) {
  const {list} = useTableContext();
  const isActive = Boolean(list.query[fromName] || list.query[toName]);

  return (
    <RangeFilterControl
      title={title}
      from={list.query[fromName]}
      to={list.query[toName]}
      isActive={isActive}
      onRange={next =>
        list.setFilter({
          [fromName]: next.from || null,
          [toName]: next.to || null,
        })
      }
    />
  );
}

export function TableDayRangeFilter({fromName, toName, title}) {
  const {list} = useTableContext();
  const isActive = Boolean(list.query[fromName] || list.query[toName]);

  return (
    <RangeFilterControl
      title={title}
      from={toDateInput(list.query[fromName])}
      to={toDateInput(list.query[toName])}
      isActive={isActive}
      onRange={next =>
        list.setFilter({
          [fromName]: next.from ? startOfDayUtc(next.from) : null,
          [toName]: next.to ? endOfDayUtc(next.to) : null,
        })
      }
    />
  );
}
