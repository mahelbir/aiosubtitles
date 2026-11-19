'use client';

import {SaveIcon} from 'lucide-react';
import {cn} from 'cn';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {LOADING_LABEL} from '@/components/common/loading-status';
import {useSettingsLayout} from './settings-layout-context';

export function SettingsSaveAction({className, children}) {
  const {isSaving, formId} = useSettingsLayout();

  return (
    <Button
      type="submit"
      form={formId}
      disabled={isSaving}
      className={cn('relative', className)}
    >
      {isSaving && (
        <Spinner data-icon="inline-start" aria-label={LOADING_LABEL} />
      )}
      <SaveIcon data-icon="inline-start" />
      Save
      {children}
    </Button>
  );
}

export function SettingsSaveStatus({className}) {
  const {isDirty, isSaving, savedText} = useSettingsLayout();

  return (
    <p
      aria-live="polite"
      className={cn('text-center text-xs text-muted-foreground', className)}
    >
      {isSaving ? 'Saving…' : isDirty ? 'You have unsaved changes' : savedText}
    </p>
  );
}

export function SettingsSaveButton({className}) {
  const {isDirty, isSaving} = useSettingsLayout();

  return (
    <div className={cn('flex flex-col gap-2 border-t pt-3', className)}>
      <SettingsSaveAction className="w-full">
        {isDirty && !isSaving && (
          <span
            aria-hidden="true"
            className="absolute -end-1 -top-1 size-2.5 rounded-full bg-warning ring-2 ring-background"
          />
        )}
      </SettingsSaveAction>
      <SettingsSaveStatus />
    </div>
  );
}
