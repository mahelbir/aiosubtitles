'use client';

import {StickyNoteIcon} from 'lucide-react';
import {
  InfoPopover,
  InfoPopoverContent,
  InfoPopoverTrigger,
} from '@/components/common/info-popover';

const DEFAULT_LABEL = 'Not';

export function NoteIcon({note, label = DEFAULT_LABEL}) {
  return (
    <InfoPopover>
      <InfoPopoverTrigger aria-label={label} className="text-muted-foreground">
        <StickyNoteIcon className="size-3.5" />
      </InfoPopoverTrigger>
      <InfoPopoverContent className="max-w-72 whitespace-pre-line">
        {note}
      </InfoPopoverContent>
    </InfoPopover>
  );
}
