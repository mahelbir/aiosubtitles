'use client';

import Link from 'next/link';
import {mergeProps} from '@base-ui/react/merge-props';
import {cn} from 'cn';
import {useCloseMobileSidebar} from '@/hooks/use-close-mobile-sidebar';

export function AdminNavLink({item, ...props}) {
  const closeMobile = useCloseMobileSidebar();

  return (
    <Link
      {...mergeProps(
        {
          onClick: event => {
            if (!event.defaultPrevented) {
              closeMobile();
            }
          },
        },
        props,
        item.linkProps,
      )}
      className={cn(props.className, item.linkProps?.className)}
      href={item.href}
    />
  );
}
