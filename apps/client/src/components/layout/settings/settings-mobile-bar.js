'use client';

import {cn} from 'cn';
import {useSettingsLayout} from './settings-layout-context';
import {SettingsSaveAction, SettingsSaveStatus} from './settings-save-button';

const BOTTOM_BAR_HEIGHT_PROPERTY = '--bottom-bar-height';

function publishBottomBarHeight(node) {
  const root = document.documentElement;
  const observer = new ResizeObserver(([entry]) =>
    root.style.setProperty(
      BOTTOM_BAR_HEIGHT_PROPERTY,
      `${entry.borderBoxSize[0].blockSize}px`,
    ),
  );
  observer.observe(node);
  return () => {
    observer.disconnect();
    root.style.removeProperty(BOTTOM_BAR_HEIGHT_PROPERTY);
  };
}

function useIsMobileBarShown() {
  const {isDirty, isSaving} = useSettingsLayout();
  return isDirty || isSaving;
}

export function SettingsMobileSavedStatus({className}) {
  if (useIsMobileBarShown()) {
    return null;
  }

  return <SettingsSaveStatus className={className} />;
}

export function SettingsMobileBar({className}) {
  if (!useIsMobileBarShown()) {
    return null;
  }

  return (
    <div className={cn('md:hidden', className)}>
      <div aria-hidden="true" className="h-20" />
      <div
        ref={publishBottomBarHeight}
        className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 px-4 pt-3 pb-safe backdrop-blur-sm"
      >
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
