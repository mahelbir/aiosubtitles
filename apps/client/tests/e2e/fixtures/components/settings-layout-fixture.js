'use client';

import {useId, useState} from 'react';
import {DownloadIcon, LanguagesIcon, LayersIcon} from 'lucide-react';
import {useSearchParams} from 'next/navigation';
import {SettingsLayout} from '@/components/layout/settings/settings-layout';
import {FixtureState} from './fixture-state';

const SECTIONS = [
  {value: 'sources', label: 'Sources', icon: LayersIcon},
  {value: 'languages', label: 'Languages', icon: LanguagesIcon},
  {value: 'install', label: 'Install', icon: DownloadIcon},
];

export function SettingsLayoutFixture() {
  const searchParams = useSearchParams();
  const formId = useId();
  const [activeSection, setActiveSection] = useState(SECTIONS[0].value);
  const [saveCount, setSaveCount] = useState(0);

  return (
    <SettingsLayout
      title="Subtitle settings"
      description="Choose where subtitles come from."
      sections={SECTIONS}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      isDirty={searchParams.has('dirty')}
      isSaving={searchParams.has('saving')}
      formId={formId}
      savedText={searchParams.has('unsaved') ? 'Not saved yet' : undefined}
    >
      <form
        id={formId}
        onSubmit={event => {
          event.preventDefault();
          setSaveCount(count => count + 1);
        }}
      >
        <FixtureState value={{activeSection, saveCount}} />
      </form>
    </SettingsLayout>
  );
}
