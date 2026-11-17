'use client';

import {CircleXIcon} from 'lucide-react';

function stopPropagation(event) {
  event.stopPropagation();
}

export function FilterClear({title, onReset}) {
  return (
    <span
      aria-hidden="true"
      data-icon="inline-start"
      title={`${title} filtresini temizle`}
      className="rounded-sm opacity-70 transition-opacity hover:opacity-100"
      onPointerDown={stopPropagation}
      onMouseDown={stopPropagation}
      onClick={event => {
        stopPropagation(event);
        onReset();
      }}
    >
      <CircleXIcon />
    </span>
  );
}
