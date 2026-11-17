'use client';

import {createContext, use, useState} from 'react';
import {ChevronRightIcon} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {containsHref} from '@/lib/nav';
import {AdminNavLink} from './admin-nav-link';

const ActiveHrefContext = createContext(null);

const useActiveHref = () => use(ActiveHrefContext);

function useBranchOpen(shouldOpen) {
  const [open, setOpen] = useState(shouldOpen);
  const [lastShouldOpen, setLastShouldOpen] = useState(shouldOpen);

  if (lastShouldOpen !== shouldOpen) {
    setLastShouldOpen(shouldOpen);
    setOpen(shouldOpen);
  }

  return [open, setOpen];
}

function NavSubBranch({item}) {
  const activeHref = useActiveHref();
  const [open, setOpen] = useBranchOpen(containsHref(item.items, activeHref));

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={<SidebarMenuSubItem />}
    >
      <SidebarMenuSubButton
        isActive={item.href === activeHref}
        className="group/nav-branch"
        render={<CollapsibleTrigger />}
      >
        <span>{item.label}</span>
        <ChevronRightIcon className="ms-auto transition-transform duration-200 group-aria-expanded/nav-branch:rotate-90" />
      </SidebarMenuSubButton>
      <CollapsibleContent>
        <NavSubTree items={item.items} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function NavSubTree({items}) {
  const activeHref = useActiveHref();

  return (
    <SidebarMenuSub>
      {items.map(item =>
        item.items?.length ? (
          <NavSubBranch key={item.href} item={item} />
        ) : (
          <SidebarMenuSubItem key={item.href}>
            <SidebarMenuSubButton
              isActive={item.href === activeHref}
              render={<AdminNavLink item={item} />}
            >
              <span>{item.label}</span>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        ),
      )}
    </SidebarMenuSub>
  );
}

function NavMenuItems({items}) {
  const activeHref = useActiveHref();

  return items.map(item =>
    item.items?.length ? (
      <DropdownMenuSub key={item.href}>
        <DropdownMenuSubTrigger>{item.label}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuGroup>
            <NavMenuItems items={item.items} />
          </DropdownMenuGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    ) : (
      <DropdownMenuItem
        key={item.href}
        aria-current={item.href === activeHref ? 'page' : undefined}
        render={<AdminNavLink item={item} />}
      >
        {item.label}
      </DropdownMenuItem>
    ),
  );
}

function NavGroupBody({item}) {
  const activeHref = useActiveHref();
  const {state, isMobile} = useSidebar();
  const Icon = item.icon;
  const holdsActive = containsHref(item.items, activeHref);
  const [open, setOpen] = useBranchOpen(holdsActive);

  if (state === 'collapsed' && !isMobile) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                isActive={holdsActive || item.href === activeHref}
                aria-current={item.href === activeHref ? 'page' : undefined}
              />
            }
          >
            <Icon />
            <span>{item.label}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="right"
            align="start"
            sideOffset={4}
            className="min-w-44"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel>{item.label}</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <NavMenuItems items={item.items} />
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={<SidebarMenuItem />}
    >
      <SidebarMenuButton
        isActive={item.href === activeHref}
        className="group/nav-group"
        render={<CollapsibleTrigger />}
      >
        <Icon />
        <span>{item.label}</span>
        <ChevronRightIcon className="ms-auto transition-transform duration-200 group-aria-expanded/nav-group:rotate-90" />
      </SidebarMenuButton>
      <CollapsibleContent>
        <NavSubTree items={item.items} />
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AdminNavGroup({item, activeHref}) {
  return (
    <ActiveHrefContext.Provider value={activeHref}>
      <NavGroupBody item={item} />
    </ActiveHrefContext.Provider>
  );
}
