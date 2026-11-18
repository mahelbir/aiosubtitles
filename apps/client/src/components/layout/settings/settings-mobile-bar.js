'use client';

import {cn} from 'cn';
import {useSettingsLayout} from './settings-layout-context';
import {SettingsSaveAction} from './settings-save-button';

export function SettingsMobileBar({className}) {
  const {isDirty, isSaving} = useSettingsLayout();

  if (!isDirty && !isSaving) {
    return null;
  }

  return (
    <div className={cn('md:hidden', className)}>
      <div aria-hidden="true" className="h-20" />
      <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 px-4 pt-3 pb-safe backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium">Unsaved changes</span>
            <span className="truncate text-xs text-muted-foreground">
              Save to apply them to your addon.
            </span>
          </div>
          <SettingsSaveAction className="shrink-0" />
        </div>
      </div>
    </div>
  );
}
