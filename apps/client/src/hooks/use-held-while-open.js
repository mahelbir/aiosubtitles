'use client';

import {useState} from 'react';

export function useHeldWhileOpen(value) {
  const [isHolding, setIsHolding] = useState(false);
  const [isClosed, setIsClosed] = useState(true);
  const [held, setHeld] = useState(value);
  if (!isHolding && held !== value) {
    setHeld(value);
  }

  return {
    value: isHolding ? held : value,
    popupProps: {
      onOpenChange: open => {
        setIsClosed(!open);
        if (open) {
          setIsHolding(true);
        }
      },
    },
    triggerProps: {
      onFocus: () => {
        if (isClosed) {
          setIsHolding(false);
        }
      },
    },
  };
}
