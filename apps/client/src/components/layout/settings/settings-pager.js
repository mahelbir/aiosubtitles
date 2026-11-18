'use client';

import {ChevronLeftIcon, ChevronRightIcon} from 'lucide-react';
import {cn} from 'cn';
import {Button} from '@/components/ui/button';
import {useSettingsLayout} from './settings-layout-context';

function SettingsPagerButton({label, section, className, children}) {
  const {onSectionChange} = useSettingsLayout();
  const sectionValue = section?.value;

  return (
    <Button
      variant="outline"
      disabled={!section}
      className={cn(
        'h-auto min-w-0 flex-1 gap-2 rounded-xl px-3 py-3',
        className,
      )}
      onClick={() => onSectionChange(sectionValue)}
    >
      {children}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-muted-foreground uppercase">{label}</span>
        <span className="truncate">
          {section ? section.label : <span aria-hidden="true">—</span>}
        </span>
      </span>
    </Button>
  );
}

export function SettingsPager({className}) {
  const {sections, activeIndex} = useSettingsLayout();

  return (
    <div className={cn('flex items-stretch gap-2', className)}>
      <SettingsPagerButton
        label="Previous"
        section={sections[activeIndex - 1]}
        className="text-start"
      >
        <ChevronLeftIcon className="text-muted-foreground" />
      </SettingsPagerButton>
      <SettingsPagerButton
        label="Next"
        section={sections[activeIndex + 1]}
        className="flex-row-reverse text-end"
      >
        <ChevronRightIcon className="text-muted-foreground" />
      </SettingsPagerButton>
    </div>
  );
}
