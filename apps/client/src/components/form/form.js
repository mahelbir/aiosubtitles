'use client';

import {useRef} from 'react';
import {cn} from 'cn';
import {BusyRegion} from '@/components/common/loading-status';
import {formContext} from '@/lib/form-context';
import {focusFirstError} from '@/lib/form';

const FORM_CLASS = 'flex flex-col gap-4';

export function Form({form, onBeforeSubmit, children, className, ...props}) {
  const formRef = useRef(null);

  const onSubmit = async event => {
    event.preventDefault();
    await onBeforeSubmit?.();
    await form.handleSubmit();
    window.requestAnimationFrame(() => focusFirstError(formRef.current));
  };

  return (
    <formContext.Provider value={form}>
      <form
        ref={formRef}
        noValidate
        onSubmit={onSubmit}
        className={cn(FORM_CLASS, className)}
        {...props}
      >
        {children}
      </form>
    </formContext.Provider>
  );
}

export function FormSkeleton({className, children}) {
  return (
    <BusyRegion className={cn(FORM_CLASS, className)}>{children}</BusyRegion>
  );
}
