import {HeadingRow} from '@/components/common/heading-row';
import {BusyRegion} from '@/components/common/loading-status';
import {Skeleton} from '@/components/ui/skeleton';

export function PageHeader({title, description, children}) {
  return (
    <HeadingRow
      heading={
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      }
      description={description}
      actions={children}
    />
  );
}

export function PageHeaderSkeleton({description, children}) {
  return (
    <HeadingRow
      heading={
        <BusyRegion>
          <Skeleton className="h-8 w-56" />
        </BusyRegion>
      }
      description={description}
      actions={children}
    />
  );
}
