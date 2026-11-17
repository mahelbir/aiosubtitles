'use client';

import {Button} from '@/components/ui/button';
import {useFormContext} from '@/lib/form-context';
import {Spinner} from '@/components/ui/spinner';
import {LOADING_LABEL} from '@/components/common/loading-status';

export function SubmitButton({children, disabled = false, ...props}) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={state => state.isSubmitting}>
      {isSubmitting => (
        <Button type="submit" {...props} disabled={disabled || isSubmitting}>
          {isSubmitting && (
            <Spinner data-icon="inline-start" aria-label={LOADING_LABEL} />
          )}
          {children}
        </Button>
      )}
    </form.Subscribe>
  );
}
