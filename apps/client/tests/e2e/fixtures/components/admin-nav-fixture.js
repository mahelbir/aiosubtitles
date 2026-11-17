'use client';

import {useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {
  ChartColumnIcon,
  CircleHelpIcon,
  SettingsIcon,
  UserIcon,
} from 'lucide-react';
import {AdminNavGroup} from '@/components/layout/admin/admin-nav-group';
import {AdminNavLink} from '@/components/layout/admin/admin-nav-link';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import {FixtureState} from './fixture-state';

export function AdminNavFixture() {
  const isCollapsed = useSearchParams().has('isCollapsed');
  const [clicks, setClicks] = useState({
    daily: 0,
    profile: 0,
    settings: 0,
    settingsHost: 0,
  });

  const count = name =>
    setClicks(current => ({...current, [name]: current[name] + 1}));

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <Sidebar collapsible="icon">
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              <NavItem
                item={{
                  href: '#ayarlar',
                  label: 'Ayarlar',
                  icon: SettingsIcon,
                  linkProps: {
                    title: 'Ayarlar sayfası',
                    className: 'italic p-0',
                    onClick: () => count('settings'),
                  },
                }}
                className="underline"
                onClick={() => count('settingsHost')}
              />
              <NavItem
                item={{
                  href: '#profil',
                  label: 'Profil',
                  icon: UserIcon,
                  linkProps: {
                    'aria-current': 'location',
                    onClick: event => {
                      event.preventDefault();
                      count('profile');
                    },
                  },
                }}
              />
              <NavItem
                item={{
                  href: 'https://ornek.com/yardim',
                  label: 'Yardım',
                  icon: CircleHelpIcon,
                  linkProps: {
                    target: '_blank',
                    rel: 'noreferrer',
                    href: '#yanlis',
                  },
                }}
                isActive
              />
              <AdminNavGroup
                item={{
                  href: '#raporlar',
                  label: 'Raporlar',
                  icon: ChartColumnIcon,
                  items: [
                    {href: '#ozet', label: 'Özet'},
                    {
                      href: '#gunluk',
                      label: 'Günlük',
                      linkProps: {onClick: () => count('daily')},
                    },
                  ],
                }}
              />
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-4">
        <SidebarTrigger />
        <NavState clicks={clicks} />
      </div>
    </SidebarProvider>
  );
}

function NavItem({item, isActive, className, onClick}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={item.label}
        isActive={isActive}
        className={className}
        onClick={onClick}
        render={<AdminNavLink item={item} />}
      >
        <item.icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function NavState({clicks}) {
  const {isMobile, openMobile, state} = useSidebar();

  return (
    <FixtureState
      value={{
        clicks,
        isMobile,
        isMobileOpen: openMobile,
        sidebarState: state,
      }}
    />
  );
}
