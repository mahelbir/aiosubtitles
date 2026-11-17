'use client';

import {ArrowDownIcon, ArrowUpIcon} from 'lucide-react';
import {cn} from 'cn';
import {Button} from '@/components/ui/button';
import {useScrollEdges} from '@/hooks/use-scroll-edges';

function ScrollButton({
  icon: Icon,
  label,
  isInactive,
  mode,
  onClick,
  className,
}) {
  if (!isInactive || mode === 'disable') {
    return (
      <Button
        variant="outline"
        size="icon-lg"
        aria-label={label}
        className={cn('rounded-full shadow-lg', className)}
        disabled={isInactive}
        onClick={onClick}
      >
        <Icon />
      </Button>
    );
  }
  return null;
}

export function ScrollToTopButton({mode = 'hide', className}) {
  const {isReady, isAtTop, scrollToTop} = useScrollEdges();
  if (!isReady) {
    return null;
  }
  return (
    <ScrollButton
      icon={ArrowUpIcon}
      label="Scroll to top"
      isInactive={isAtTop}
      mode={mode}
      onClick={scrollToTop}
      className={className}
    />
  );
}

export function ScrollToBottomButton({mode = 'hide', className}) {
  const {isReady, isAtBottom, scrollToBottom} = useScrollEdges();
  if (!isReady) {
    return null;
  }
  return (
    <ScrollButton
      icon={ArrowDownIcon}
      label="Scroll to bottom"
      isInactive={isAtBottom}
      mode={mode}
      onClick={scrollToBottom}
      className={className}
    />
  );
}

export function ScrollButtons({className}) {
  const {isReady, isAtTop, isAtBottom} = useScrollEdges();

  if (!isReady || (isAtTop && isAtBottom)) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed end-6 bottom-safe z-40 flex flex-col gap-2',
        className,
      )}
    >
      <ScrollToTopButton mode="disable" />
      <ScrollToBottomButton mode="disable" />
    </div>
  );
}
