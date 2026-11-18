import {CaptionsIcon} from 'lucide-react';

export function SettingsHeader({title, description}) {
  return (
    <header className="flex flex-col items-center gap-3 py-6 text-center md:flex-row md:gap-4 md:py-8 md:text-start">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground md:size-16">
        <CaptionsIcon aria-hidden="true" className="size-6 md:size-8" />
      </span>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          {title}
        </h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
    </header>
  );
}
