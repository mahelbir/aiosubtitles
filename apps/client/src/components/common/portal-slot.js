'use client';

import {createContext, use, useCallback, useState} from 'react';
import {createPortal} from 'react-dom';
import {cn} from 'cn';

const PortalSlotContext = createContext(null);

export function PortalSlotProvider({children}) {
  const [target, setTarget] = useState(null);
  const attach = useCallback(element => {
    setTarget(element);
    return () => setTarget(current => (current === element ? null : current));
  }, []);

  return (
    <PortalSlotContext value={{target, attach}}>{children}</PortalSlotContext>
  );
}

export function PortalSlot({className, ...props}) {
  const slot = use(PortalSlotContext);

  return (
    <div
      data-slot="portal-slot"
      ref={slot?.attach}
      className={cn('contents', className)}
      {...props}
    />
  );
}

export function PortalSlotContent({children}) {
  const slot = use(PortalSlotContext);
  if (!slot) {
    return children;
  }
  return slot.target ? createPortal(children, slot.target) : null;
}
