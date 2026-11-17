import {cn} from 'cn';

export function DescriptionList({
  orientation = 'vertical',
  className,
  ...props
}) {
  return (
    <dl
      data-slot="description-list"
      data-orientation={orientation}
      className={cn(
        'group/description-list @container/description-list grid grid-cols-12 gap-4 text-sm data-[orientation=horizontal]:flex data-[orientation=horizontal]:flex-wrap data-[orientation=horizontal]:gap-x-4 data-[orientation=horizontal]:gap-y-1',
        className,
      )}
      {...props}
    />
  );
}

export function DescriptionListItem({className, ...props}) {
  return (
    <div
      data-slot="description-list-item"
      className={cn(
        'col-span-12 flex min-w-0 flex-col gap-1 group-data-[orientation=horizontal]/description-list:flex-row group-data-[orientation=horizontal]/description-list:items-baseline group-data-[orientation=horizontal]/description-list:gap-1.5 @md/description-list:col-span-6 @3xl/description-list:col-span-3',
        className,
      )}
      {...props}
    />
  );
}

export function DescriptionListTerm({className, ...props}) {
  return (
    <dt
      data-slot="description-list-term"
      className={cn('shrink-0 text-muted-foreground', className)}
      {...props}
    />
  );
}

export function DescriptionListDetails({className, ...props}) {
  return (
    <dd
      data-slot="description-list-details"
      className={cn('min-w-0 wrap-anywhere tabular-nums', className)}
      {...props}
    />
  );
}
