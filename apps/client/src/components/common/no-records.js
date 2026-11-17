import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
} from '@/components/ui/empty';

export function NoRecords({
  description = 'No records found.',
  action,
  className,
}) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyDescription role="status">{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
