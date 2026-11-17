import {Field} from '@/components/ui/field';
import {Skeleton} from '@/components/ui/skeleton';

export function FieldSkeleton({className = 'col-span-12'}) {
  return (
    <Field className={className}>
      <Skeleton className="h-3.5 w-24 max-w-full" />
      <Skeleton className="h-8 w-full rounded-lg" />
    </Field>
  );
}

export function CheckboxFieldSkeleton({className = 'col-span-12'}) {
  return (
    <Field orientation="horizontal" className={className}>
      <Skeleton className="size-4 shrink-0 rounded-sm" />
      <Skeleton className="h-3.5 w-24 max-w-full" />
    </Field>
  );
}
