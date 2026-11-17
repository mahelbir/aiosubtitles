'use client';

import {useId} from 'react';
import {cn} from 'cn';
import {HeadingRow} from '@/components/common/heading-row';

export function PageSection({
  title,
  description,
  actions,
  className,
  children,
}) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className={cn('flex flex-col gap-3', className)}
    >
      <HeadingRow
        heading={
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
        }
        description={description}
        actions={actions}
      />
      {children}
    </section>
  );
}
