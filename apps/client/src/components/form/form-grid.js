'use client';

import {cn} from 'cn';
import {FieldGroup} from '@/components/ui/field';
import {useAutoAnimate} from '@/hooks/use-auto-animate';
import {rowMotion} from '@/lib/height-motion';

export function FormGrid({className, ...props}) {
  const gridRef = useAutoAnimate(rowMotion);

  return (
    <FieldGroup
      ref={gridRef}
      className={cn('grid grid-cols-12 content-start gap-4', className)}
      {...props}
    />
  );
}
