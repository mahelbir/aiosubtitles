'use client';

import {SettingsHeader} from './settings-header';
import {SettingsLayoutContext} from './settings-layout-context';
import {
  SettingsMobileBar,
  SettingsMobileSavedStatus,
} from './settings-mobile-bar';
import {SettingsNav, SettingsSectionPicker} from './settings-nav';
import {SettingsPager} from './settings-pager';
import {SettingsSaveButton} from './settings-save-button';

export function SettingsLayout({
  title,
  description,
  sections,
  activeSection,
  onSectionChange,
  isDirty,
  isSaving,
  formId,
  savedText = 'All changes saved',
  children,
}) {
  return (
    <SettingsLayoutContext
      value={{
        sections,
        activeSection,
        activeIndex: sections.findIndex(
          section => section.value === activeSection,
        ),
        onSectionChange,
        isDirty,
        isSaving,
        formId,
        savedText,
      }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pb-8 md:px-6">
        <SettingsHeader title={title} description={description} />
        <div className="mb-4 flex flex-col gap-2 md:hidden">
          <SettingsSectionPicker />
          <SettingsMobileSavedStatus />
        </div>
        <div className="flex gap-10">
          <aside className="w-52 shrink-0 max-md:hidden">
            <div className="sticky top-6 flex flex-col gap-3">
              <SettingsNav />
              <SettingsSaveButton />
            </div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col gap-8">
            {children}
            <SettingsPager className="md:hidden" />
          </div>
        </div>
        <SettingsMobileBar />
      </div>
    </SettingsLayoutContext>
  );
}
