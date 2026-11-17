'use client';

import {useLocalStorage} from '@reactuses/core';
import {
  MAIN_CONTENT_ID,
  SkipToContent,
} from '@/components/common/skip-to-content';
import {SidebarInset, SidebarProvider} from '@/components/ui/sidebar';
import {AdminNavbar} from './admin-navbar';
import {AdminSidebar} from './admin-sidebar';
import {AdminFooter} from './admin-footer';

const SIDEBAR_STATE_STORAGE_KEY = 'sidebar-state';

export function AdminShell({children}) {
  const [sidebarOpen, setSidebarOpen] = useLocalStorage(
    SIDEBAR_STATE_STORAGE_KEY,
    true,
  );

  return (
    <SidebarProvider open={sidebarOpen ?? true} onOpenChange={setSidebarOpen}>
      <SkipToContent />
      <AdminSidebar />
      <SidebarInset id={MAIN_CONTENT_ID} tabIndex={-1} className="min-w-0">
        <AdminNavbar />
        <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
        <AdminFooter />
      </SidebarInset>
    </SidebarProvider>
  );
}
