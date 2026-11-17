'use client';

import Link from 'next/link';
import {ChevronsUpDownIcon, LogOutIcon, UserIcon} from 'lucide-react';
import {Avatar, AvatarFallback} from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {useCloseMobileSidebar} from '@/hooks/use-close-mobile-sidebar';
import {useAuthStore} from '@/stores/auth-store';
import {useLogout} from '@/api/auth';

export function AdminUserMenu() {
  const logoutMutation = useLogout();
  const principal = useAuthStore(state => state.principal);
  const closeMobile = useCloseMobileSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
            <Avatar>
              <AvatarFallback>
                <UserIcon />
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-start leading-tight">
              <span className="truncate font-medium">{principal?.email}</span>
              <span className="sr-only">Kullanıcı menüsü</span>
            </div>
            <ChevronsUpDownIcon className="ms-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            side="top"
            align="start"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuItem
                render={<Link href="/admin/profile" onClick={closeMobile} />}
              >
                <UserIcon />
                Profil
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={logoutMutation.isPending}
                onClick={() => logoutMutation.mutate()}
              >
                <LogOutIcon />
                Çıkış yap
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
