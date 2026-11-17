'use client';

import {useMemo} from 'react';
import {usePathname, useSearchParams} from 'next/navigation';
import {
  LayoutDashboardIcon,
  SettingsIcon,
  ShieldIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react';
import {cn} from 'cn';
import {IconButton} from '@/components/common/icon-button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {useAuthorization} from '@/hooks/use-authorization';
import {useCloseMobileSidebar} from '@/hooks/use-close-mobile-sidebar';
import {resolveActiveHref} from '@/lib/nav';
import {AdminBrand, AdminBrandLink, AdminHomeLink} from './admin-brand';
import {AdminNavGroup} from './admin-nav-group';
import {AdminNavLink} from './admin-nav-link';
import {AdminUserMenu} from './admin-user-menu';
import {ThemeModeToggle} from './theme-mode-toggle';

const NAV_ITEMS = [
  {href: '/admin/settings', label: 'Ayarlar', icon: SettingsIcon},
  {href: '/admin/users', label: 'Kullanıcılar', icon: UsersIcon},
  {href: '/admin/roles', label: 'Roller', icon: ShieldIcon},
];

export function AdminSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const closeMobile = useCloseMobileSidebar();
  const {isMobile} = useSidebar();
  const {can} = useAuthorization();
  const navItems = useMemo(
    () =>
      NAV_ITEMS.filter(
        item => !item.permission || can({permission: item.permission}),
      ),
    [can],
  );
  const activeHref = resolveActiveHref(
    navItems,
    pathname,
    searchParams.toString(),
  );

  return (
    <Sidebar side={isMobile ? 'right' : 'left'} collapsible="icon">
      <SidebarHeader
        className={cn(
          isMobile && 'h-12 flex-row items-center justify-between px-3 py-0',
        )}
      >
        {isMobile ? (
          <>
            <AdminBrandLink onClick={closeMobile} />
            <IconButton
              variant="ghost"
              title="Menüyü kapat"
              onClick={closeMobile}
            >
              <XIcon />
            </IconButton>
          </>
        ) : (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                variant="plain"
                size="lg"
                render={<AdminHomeLink />}
              >
                <span className="hidden size-8 items-center justify-center group-data-[collapsible=icon]:flex">
                  <LayoutDashboardIcon />
                </span>
                <AdminBrand className="group-data-[collapsible=icon]:hidden" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navItems.map(item =>
              item.items?.length ? (
                <AdminNavGroup
                  key={item.href}
                  item={item}
                  activeHref={activeHref}
                />
              ) : (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    tooltip={item.label}
                    isActive={item.href === activeHref}
                    render={<AdminNavLink item={item} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ),
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="max-md:flex-row max-md:items-center">
        <AdminUserMenu />
        {isMobile && <ThemeModeToggle />}
      </SidebarFooter>
    </Sidebar>
  );
}
