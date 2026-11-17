'use client';

import {PageSection} from '@/components/common/page-section';

export function FixtureSection({title, children}) {
  return (
    <PageSection title={title} className="gap-4">
      {children}
    </PageSection>
  );
}
