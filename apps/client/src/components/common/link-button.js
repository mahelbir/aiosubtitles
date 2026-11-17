import Link from 'next/link';
import {cn} from 'cn';
import {buttonVariants} from '@/components/ui/button';

export function LinkButton({variant, size, className, ...props}) {
  return (
    <Link
      data-slot="button"
      className={cn(buttonVariants({variant, size}), className)}
      {...props}
    />
  );
}
