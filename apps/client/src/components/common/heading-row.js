import {cn} from 'cn';

export function HeadingRow({
  heading,
  description,
  actions,
  className,
  ...props
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-2',
        className,
      )}
      {...props}
    >
      <div className="grid gap-1">
        {heading}
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
