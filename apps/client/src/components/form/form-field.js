'use client';

import {fieldContext, useFormContext} from '@/lib/form-context';

export function FormField({
  name,
  children,
  className = 'col-span-12',
  ...props
}) {
  const form = useFormContext();
  return (
    <form.Field name={name} {...props}>
      {field => (
        <fieldContext.Provider value={field}>
          {className ? <div className={className}>{children}</div> : children}
        </fieldContext.Provider>
      )}
    </form.Field>
  );
}
