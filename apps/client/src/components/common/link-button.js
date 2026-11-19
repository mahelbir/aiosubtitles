import Link from 'next/link';
import {cn} from 'cn';
import {ExternalLinkIcon} from 'lucide-react';
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

export function ExternalLinkButton({
  variant = 'link',
  size = 'inline',
  children,
  ...props
}) {
  return (
    <LinkButton
      variant={variant}
      size={size}
      target="_blank"
      rel="noreferrer"
      {...props}
    >
      {children}
      <ExternalLinkIcon data-icon="inline-end" />
    </LinkButton>
  );
}
