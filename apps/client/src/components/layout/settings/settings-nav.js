'use client';

import {cn} from 'cn';
import {Button} from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {useSettingsLayout} from './settings-layout-context';

export function SettingsNav({className}) {
  const {sections, activeSection, activeIndex, onSectionChange} =
    useSettingsLayout();

  return (
    <nav
      aria-label="Settings sections"
      className={cn('relative flex flex-col gap-1', className)}
    >
      {activeIndex >= 0 && (
        <span
          aria-hidden="true"
          data-slot="settings-nav-indicator"
          style={{'--settings-nav-index': activeIndex}}
          className="pointer-events-none absolute inset-x-0 top-0 h-10 translate-y-[calc(var(--settings-nav-index)*(100%+var(--spacing)))] rounded-lg border border-foreground/6 bg-accent transition-transform duration-200 ease-out"
        />
      )}
      {sections.map(section => (
        <Button
          key={section.value}
          variant="nav"
          aria-current={section.value === activeSection ? 'page' : undefined}
          className="relative h-10 w-full justify-start gap-3 px-3"
          onClick={() => onSectionChange(section.value)}
        >
          <section.icon data-icon="inline-start" />
          {section.label}
        </Button>
      ))}
    </nav>
  );
}

export function SettingsSectionPicker({className}) {
  const {sections, activeSection, onSectionChange} = useSettingsLayout();

  return (
    <Select
      items={sections}
      value={activeSection}
      onValueChange={value => onSectionChange(value)}
    >
      <SelectTrigger
        aria-label="Settings section"
        className={cn('w-full', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {sections.map(section => (
          <SelectItem key={section.value} value={section.value}>
            <section.icon />
            {section.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
