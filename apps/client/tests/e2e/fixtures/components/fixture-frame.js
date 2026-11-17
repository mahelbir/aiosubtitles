'use client';

import {Suspense, useId} from 'react';
import {PageLoader} from '@/components/common/page-loader';
import {useIsClient} from '@/hooks/use-is-client';

export function FixtureFrame({name, title, children}) {
  return (
    <Suspense fallback={<PageLoader />}>
      <FixtureRoot name={name} title={title}>
        {children}
      </FixtureRoot>
    </Suspense>
  );
}

function FixtureRoot({name, title, children}) {
  const isClient = useIsClient();
  const titleId = useId();

  return (
    <section
      data-testid="fixture"
      data-fixture={name}
      aria-busy={!isClient || undefined}
      aria-labelledby={titleId}
      className="flex flex-col gap-6"
    >
      <h1 id={titleId} className="text-2xl font-semibold">
        {title}
      </h1>
      {children}
    </section>
  );
}
