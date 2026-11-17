'use client';

import {hasUnsavedChanges} from '@/lib/form';
import {useFormContext} from '@/lib/form-context';
import {useUnsavedChanges} from '@/hooks/use-unsaved-changes';

function Guard({isUnsaved}) {
  useUnsavedChanges(isUnsaved);
  return null;
}

export function UnsavedChangesGuard() {
  const form = useFormContext();

  return (
    <form.Subscribe selector={hasUnsavedChanges}>
      {isUnsaved => <Guard isUnsaved={isUnsaved} />}
    </form.Subscribe>
  );
}
