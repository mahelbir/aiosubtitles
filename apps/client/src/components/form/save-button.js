import {SaveIcon} from 'lucide-react';
import {cn} from 'cn';
import {SubmitButton} from '@/components/form/submit-button';
import {Skeleton} from '@/components/ui/skeleton';

const ALIGN_CLASS = {
  start: '',
  center: 'mx-auto',
  end: 'ms-auto',
};

export function SaveButton({
  children,
  variant = 'default',
  align = 'center',
  className,
  ...props
}) {
  return (
    <SubmitButton
      variant={variant}
      className={cn(ALIGN_CLASS[align], className)}
      {...props}
    >
      <SaveIcon data-icon="inline-start" />
      {children ?? 'Save'}
    </SubmitButton>
  );
}

export function SaveButtonSkeleton({align = 'center', className}) {
  return <Skeleton className={cn('h-8 w-24', ALIGN_CLASS[align], className)} />;
}
