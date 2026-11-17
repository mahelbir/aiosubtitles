import {env} from '@/config/env';

export function AdminFooter() {
  return (
    <footer className="flex items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
      <span>&copy; {new Date().getFullYear()} Emadot Digital</span>
      <span className="tabular-nums">v{env.APP_VERSION}</span>
    </footer>
  );
}
