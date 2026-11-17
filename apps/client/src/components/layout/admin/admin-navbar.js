'use client';

import {SidebarTrigger} from '@/components/ui/sidebar';
import {AdminBrandLink} from './admin-brand';
import {ThemeModeToggle} from './theme-mode-toggle';

export function AdminNavbar() {
  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
      <AdminBrandLink className="md:hidden" />
      <SidebarTrigger
        className="max-md:ms-auto max-md:-me-1 md:-ms-1"
        aria-label="Menü"
      />
      <div className="ms-auto flex items-center gap-1 max-md:hidden">
        <ThemeModeToggle />
      </div>
    </header>
  );
}
