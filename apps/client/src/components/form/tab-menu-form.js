'use client';

import {cn} from 'cn';
import {Form} from '@/components/form/form';
import {UnsavedChangesGuard} from '@/components/form/unsaved-changes-guard';

export function TabMenuForm({form, className, children, ...props}) {
  return (
    <Form form={form} className={cn('flex-1 gap-0', className)} {...props}>
      <UnsavedChangesGuard />
      {children}
    </Form>
  );
}
