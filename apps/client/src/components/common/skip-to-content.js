import {cn} from 'cn';

export const MAIN_CONTENT_ID = 'main-content';

export function SkipToContent({children = 'Skip to main content', className}) {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className={cn(
        'sr-only rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg',
        'focus-visible:not-sr-only focus-visible:fixed focus-visible:start-4 focus-visible:top-4 focus-visible:z-50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        className,
      )}
    >
      {children}
    </a>
  );
}
