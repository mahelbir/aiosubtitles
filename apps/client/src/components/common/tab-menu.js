'use client';

import {createContext, Fragment, use, useMemo} from 'react';
import {ChevronDownIcon} from 'lucide-react';
import {cn} from 'cn';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardFooter, CardHeader} from '@/components/ui/card';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {BusyRegion} from '@/components/common/loading-status';

const TabMenuContext = createContext(null);
const EMPTY_INVALID = [];

export function TabMenu({
  items,
  value,
  onValueChange,
  title,
  invalidValues = EMPTY_INVALID,
  className,
  children,
}) {
  const active = items.find(item => item.value === value) ?? items[0];
  const context = useMemo(
    () => ({items, active, onValueChange, title, invalidValues}),
    [items, active, onValueChange, title, invalidValues],
  );
  return (
    <TabMenuContext.Provider value={context}>
      <Tabs
        value={active?.value}
        onValueChange={next => onValueChange(next)}
        orientation="vertical"
        className={cn('w-full flex-col', className)}
      >
        {children}
      </Tabs>
    </TabMenuContext.Provider>
  );
}

function itemVariant(item, active, invalidValues) {
  if (invalidValues.includes(item.value)) {
    return 'destructive';
  }
  return item.value === active?.value ? 'secondary' : 'ghost';
}

export function TabMenuBar({className}) {
  const {items, active, onValueChange, title, invalidValues} =
    use(TabMenuContext);
  return (
    <Drawer showSwipeHandle>
      <DrawerTrigger
        render={
          <Button
            variant={invalidValues.length > 0 ? 'destructive' : 'ghost'}
            size="lg"
            className={cn('-ms-2.5 w-fit self-start md:hidden', className)}
          />
        }
      >
        <span className="text-lg font-semibold">{active?.label}</span>
        <ChevronDownIcon data-icon="inline-end" />
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className={cn(!title && 'sr-only')}>
          <DrawerTitle>{title ?? active?.label}</DrawerTitle>
        </DrawerHeader>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-4">
          {items.map(item => (
            <DrawerClose
              key={item.value}
              render={
                <Button
                  variant={itemVariant(item, active, invalidValues)}
                  size="lg"
                  className="w-full justify-start gap-2"
                  onClick={() => onValueChange(item.value)}
                />
              }
            >
              {item.Icon && <item.Icon data-icon="inline-start" />}
              <span>{item.label}</span>
            </DrawerClose>
          ))}
        </nav>
      </DrawerContent>
    </Drawer>
  );
}

export function TabMenuList({description, className}) {
  const {items, title, invalidValues} = use(TabMenuContext);
  return (
    <div
      className={cn(
        'flex w-57 flex-col gap-6 bg-muted/50 ps-3 pe-5 pt-6 pb-4 max-md:hidden',
        className,
      )}
    >
      {(title || description) && (
        <div className="flex flex-col gap-0.5 px-3">
          {title && <h1 className="text-lg font-semibold">{title}</h1>}
          {description && (
            <p className="text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      <TabsList variant="menu" className="w-full flex-col gap-0.5 p-0">
        {items.map(item => {
          const isInvalid = invalidValues.includes(item.value);
          return (
            <TabsTrigger
              key={item.value}
              value={item.value}
              variant={isInvalid ? 'destructive' : 'menu'}
              className="min-h-8 justify-start gap-3 px-3 py-1.5"
            >
              {item.Icon && <item.Icon />}
              <span>{item.label}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </div>
  );
}

export function TabMenuPanels({className, footer, children}) {
  const {items} = use(TabMenuContext);
  return items.map(item => {
    const Wrapper = item.Wrapper ?? Fragment;
    const actions = typeof footer === 'function' ? footer(item) : footer;
    return (
      <TabsContent
        key={item.value}
        value={item.value}
        aria-label={item.label}
        className="flex min-w-0 flex-1 flex-col"
      >
        <Wrapper>
          <TabMenuPanel
            label={item.label}
            className={className}
            actions={actions}
          >
            {children(item)}
          </TabMenuPanel>
        </Wrapper>
      </TabsContent>
    );
  });
}

export function TabMenuPanelSkeleton({label, className, actions, children}) {
  return (
    <BusyRegion className="flex flex-1 flex-col">
      <TabMenuPanel label={label} className={className} actions={actions}>
        {children}
      </TabMenuPanel>
    </BusyRegion>
  );
}

function TabMenuPanel({label, className, actions, children}) {
  return (
    <>
      <div className="flex flex-1 flex-col p-(--card-spacing) md:p-6">
        <h2 className="sr-only">{label}</h2>
        <div className={className}>{children}</div>
      </div>
      {actions && <CardFooter variant="plain">{actions}</CardFooter>}
    </>
  );
}

export function TabMenuCard({
  items,
  value,
  onValueChange,
  title,
  description,
  invalidValues,
  contentClassName,
  footer,
  className,
  children,
}) {
  return (
    <TabMenu
      items={items}
      value={value}
      onValueChange={onValueChange}
      title={title}
      invalidValues={invalidValues}
    >
      <Card className={cn('gap-0 py-0 md:flex-row', className)}>
        <TabMenuList description={description} />
        <div className="flex min-w-0 flex-1 flex-col">
          <CardHeader variant="muted" className="pt-2 pb-4 md:hidden">
            <TabMenuBar />
          </CardHeader>
          <CardContent className="flex flex-1 flex-col p-0">
            <TabMenuPanels className={contentClassName} footer={footer}>
              {children}
            </TabMenuPanels>
          </CardContent>
        </div>
      </Card>
    </TabMenu>
  );
}
