'use client';

import {cn} from 'cn';
import {Badge} from '@/components/ui/badge';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';

const NARROW_LIMIT = 1;
const WIDE_LIMIT = 2;

export function BadgeList({items, variant = 'secondary', empty = '—'}) {
  if (items.length === 0) {
    return <span className="text-muted-foreground">{empty}</span>;
  }

  return (
    <span className="flex items-center gap-1">
      {items.slice(0, WIDE_LIMIT).map((item, index) => (
        <Badge
          key={item.value}
          variant={variant}
          className={cn(index >= NARROW_LIMIT && 'hidden md:inline-flex')}
        >
          {item.label}
        </Badge>
      ))}
      {items.length > NARROW_LIMIT && (
        <Popover>
          <PopoverTrigger
            nativeButton={false}
            render={
              <Badge
                variant="outline"
                className={cn(
                  'cursor-pointer',
                  items.length <= WIDE_LIMIT && 'md:hidden',
                )}
              />
            }
          >
            <span className="md:hidden">+{items.length - NARROW_LIMIT}</span>
            <span className="hidden md:inline">
              +{items.length - WIDE_LIMIT}
            </span>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="max-h-(--available-height) overflow-y-auto"
          >
            <span className="flex flex-wrap gap-1">
              {items.map(item => (
                <Badge key={item.value} variant={variant}>
                  {item.label}
                </Badge>
              ))}
            </span>
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}
