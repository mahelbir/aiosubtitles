'use client';

import {cn} from 'cn';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';

export function InfoPopover(props) {
  return <Popover {...props} />;
}

export function InfoPopoverTrigger({className, ...props}) {
  return (
    <PopoverTrigger
      openOnHover
      delay={100}
      className={cn('inline-flex', className)}
      {...props}
    />
  );
}

export function InfoPopoverContent({className, ...props}) {
  return <PopoverContent className={cn('w-auto', className)} {...props} />;
}
