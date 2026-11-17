'use client';

import {Subscribe} from '@tanstack/react-table';
import {ChevronRightIcon} from 'lucide-react';
import {cn} from 'cn';
import {IconButton} from '@/components/common/icon-button';

export const expanderColumn = {
  id: 'expander',
  enableSorting: false,
  enableHiding: false,
  meta: {className: 'w-0', skeleton: 'size-7 rounded-md'},
  cell: ({row}) => (
    <Subscribe
      source={row.table.atoms.expanded}
      selector={() => row.getIsExpanded()}
    >
      {isExpanded => (
        <IconButton
          variant="ghost"
          title="Satır detayı"
          aria-expanded={isExpanded}
          onClick={() => row.toggleExpanded()}
          className={cn('transition-transform', isExpanded && 'rotate-90')}
        >
          <ChevronRightIcon />
        </IconButton>
      )}
    </Subscribe>
  ),
};
