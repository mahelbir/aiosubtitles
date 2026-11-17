'use client';

import Link from 'next/link';
import {EllipsisIcon} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {TooltipIconButton} from '@/components/common/icon-button';
import {useTableContext} from './table-provider';

function InlineActions({actions}) {
  return (
    <span className="inline-flex justify-end gap-2">
      {actions.map(({key, label, icon: Icon, href, variant, ...props}) => (
        <TooltipIconButton
          key={key}
          title={label}
          variant={variant}
          href={href}
          {...props}
        >
          <Icon />
        </TooltipIconButton>
      ))}
    </span>
  );
}

function MenuActions({actions}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="İşlemler">
            <EllipsisIcon />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {actions.map(({key, label, icon: Icon, href, variant, ...props}) => (
            <DropdownMenuItem
              key={key}
              variant={variant === 'destructive' ? 'destructive' : undefined}
              render={href ? <Link href={href} /> : undefined}
              {...props}
            >
              <Icon />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RowActions({actions}) {
  const {isOverflowing} = useTableContext();
  const items = actions.filter(Boolean);
  if (!items.length) {
    return null;
  }
  return isOverflowing ? (
    <MenuActions actions={items} />
  ) : (
    <InlineActions actions={items} />
  );
}

export function actionsColumn(getActions) {
  return {
    id: 'actions',
    header: '',
    enableSorting: false,
    enableHiding: false,
    meta: {className: 'text-end', pinned: true, skeleton: 'ms-auto h-7 w-16'},
    cell: context => <RowActions actions={getActions(context)} />,
  };
}
