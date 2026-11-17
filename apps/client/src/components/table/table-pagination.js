'use client';

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from 'lucide-react';
import {cn} from 'cn';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {formatNumber} from '@/lib/intl';
import {useTableContext} from './table-provider';

export function TablePagination() {
  const {list, query} = useTableContext();
  const {onPageSizeChange, pageSizeOptions} = list;
  const payload = query.data;
  if (!payload || payload.meta.totalItemCount === 0) {
    return null;
  }
  const {links} = payload;
  const {
    pageNumber,
    pageSize,
    rangeStart,
    rangeEnd,
    totalItemCount,
    totalPageCount,
  } = payload.meta;
  const pages = links.window ?? [];
  const pageSizeItems = pageSizeOptions.map(size => ({
    value: String(size),
    label: String(size),
  }));

  return (
    <div className="flex w-full flex-col flex-wrap items-center justify-between gap-2 sm:flex-row">
      <div className="flex items-center gap-2">
        <Select
          items={pageSizeItems}
          value={String(pageSize)}
          onValueChange={value => onPageSizeChange(Number(value))}
        >
          <SelectTrigger size="sm" aria-label="Sayfa başına kayıt">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {pageSizeItems.map(item => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <span
          role="status"
          className="text-sm text-muted-foreground tabular-nums"
        >
          {formatNumber(rangeStart)}-{formatNumber(rangeEnd)} /{' '}
          {formatNumber(totalItemCount)}
        </span>
      </div>
      {totalPageCount > 1 && (
        <Pagination aria-label="Sayfalama" className="mx-0 w-auto">
          <PaginationContent className="flex-wrap gap-1">
            <PageLink
              page={pageNumber === links.first ? null : links.first}
              label="İlk sayfa"
            >
              <ChevronsLeftIcon />
            </PageLink>
            <PageLink
              page={links.previous}
              label="Önceki sayfa"
              className="hidden sm:flex"
            >
              <ChevronLeftIcon />
            </PageLink>
            {pages.map(page => (
              <PageLink key={page} page={page} isCurrent={page === pageNumber}>
                {formatNumber(page)}
              </PageLink>
            ))}
            <PageLink
              page={links.next}
              label="Sonraki sayfa"
              className="hidden sm:flex"
            >
              <ChevronRightIcon />
            </PageLink>
            <PageLink
              page={pageNumber === links.last ? null : links.last}
              label="Son sayfa"
            >
              <ChevronsRightIcon />
            </PageLink>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

function PageLink({page, isCurrent = false, label, className, children}) {
  const {list} = useTableContext();

  return (
    <PaginationItem className={cn('flex', className)}>
      <PaginationLink
        isActive={isCurrent}
        variant={isCurrent ? 'default' : 'outline'}
        size="icon-sm"
        className="tabular-nums"
        aria-label={label}
        disabled={page === null}
        href={page === null ? undefined : list.pageHref(page)}
        onClick={event => {
          if (page !== null && isPlainClick(event)) {
            event.preventDefault();
            list.onPageChange(page);
          }
        }}
      >
        {children}
      </PaginationLink>
    </PaginationItem>
  );
}

function isPlainClick(event) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}
