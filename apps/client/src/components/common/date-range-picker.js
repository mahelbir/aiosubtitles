'use client';

import {useState} from 'react';
import {CalendarRangeIcon, ChevronDownIcon} from 'lucide-react';
import {DateRangeFields} from '@/components/common/date-range-fields';
import {SingleToggleGroup} from '@/components/common/single-toggle-group';
import {Button} from '@/components/ui/button';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {Separator} from '@/components/ui/separator';
import {formatDateInputRange} from '@/lib/datetime';

export function DateRangePicker({
  from,
  to,
  min,
  max,
  presets,
  preset,
  onPreset,
  onRange,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const presetLabel = presets.find(option => option.value === preset)?.label;

  const choosePreset = value => {
    onPreset(value);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger render={<Button variant="outline" />}>
        <CalendarRangeIcon data-icon="inline-start" />
        {formatDateInputRange(from, to) || presetLabel}
        <ChevronDownIcon data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto">
        <SingleToggleGroup
          value={preset}
          onChange={choosePreset}
          options={presets}
        />
        <Separator />
        <DateRangeFields
          from={from}
          to={to}
          min={min}
          max={max}
          onRange={onRange}
        />
      </PopoverContent>
    </Popover>
  );
}
