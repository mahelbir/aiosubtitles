'use client';

import {createContext, use, useId, useState} from 'react';
import {isNil} from 'es-toolkit';
import {AnimatePresence, LayoutGroup, motion} from 'motion/react';
import {cn} from 'cn';
import {Badge} from '@/components/ui/badge';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';

const AnimatedTabsContext = createContext(null);

const PANEL_OFFSET = 24;
const PANEL_BLUR = 'blur(6px)';

export function AnimatedTabs({
  items,
  value,
  onValueChange,
  className,
  children,
}) {
  const layoutGroupId = useId();

  return (
    <AnimatedTabsContext value={{items, value}}>
      <LayoutGroup id={layoutGroupId}>
        <Tabs
          value={value}
          onValueChange={onValueChange}
          className={cn('w-full gap-4', className)}
        >
          {children}
        </Tabs>
      </LayoutGroup>
    </AnimatedTabsContext>
  );
}

export function AnimatedTabsList({className}) {
  const {items} = use(AnimatedTabsContext);

  return (
    <TabsList
      variant="animated"
      className={cn(
        'w-full scrollbar-none overflow-x-auto md:w-fit',
        className,
      )}
    >
      {items.map(item => (
        <AnimatedTabsTrigger key={item.value} item={item} />
      ))}
    </TabsList>
  );
}

export function AnimatedTabsPanels({className, children}) {
  const {items, value} = use(AnimatedTabsContext);
  const active = items.find(item => item.value === value);

  if (!active) {
    return null;
  }

  return (
    <TabsContent
      value={value}
      className={cn('-mx-1 overflow-x-clip px-1', className)}
      render={(props, state) => {
        const direction = getSlideDirection(state.tabActivationDirection);
        return (
          <div {...props}>
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={active.value}
                custom={direction}
                variants={{
                  enter: offset => ({
                    opacity: 0,
                    x: offset * PANEL_OFFSET,
                    scale: 0.97,
                    filter: PANEL_BLUR,
                  }),
                  center: {
                    opacity: 1,
                    x: 0,
                    scale: 1,
                    filter: 'blur(0px)',
                    transition: {
                      type: 'spring',
                      stiffness: 300,
                      damping: 28,
                      mass: 0.9,
                    },
                    transitionEnd: {filter: 'none'},
                  },
                  exit: offset => ({
                    opacity: 0,
                    x: -offset * PANEL_OFFSET,
                    scale: 0.97,
                    filter: PANEL_BLUR,
                    transition: {duration: 0.15, ease: 'easeIn'},
                  }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
              >
                {children(active)}
              </motion.div>
            </AnimatePresence>
          </div>
        );
      }}
    />
  );
}

function AnimatedTabsTrigger({item}) {
  const {value} = use(AnimatedTabsContext);
  const isActive = item.value === value;
  const Icon = item.icon;
  const [activation, setActivation] = useState({isActive, count: 0});
  if (activation.isActive !== isActive) {
    setActivation({
      isActive,
      count: isActive ? activation.count + 1 : activation.count,
    });
  }

  return (
    <TabsTrigger value={item.value} variant="animated" disabled={item.disabled}>
      {isActive && (
        <motion.span
          layoutId="indicator"
          data-slot="animated-tabs-indicator"
          transition={{type: 'spring', stiffness: 500, damping: 34, mass: 0.9}}
          className="absolute inset-0 -z-10 rounded-xl bg-background shadow-sm ring-1 ring-border"
        />
      )}
      <motion.span
        key={activation.count}
        initial={activation.count > 0 && {scale: 0.85}}
        animate={{scale: 1}}
        transition={{type: 'spring', stiffness: 500, damping: 15}}
        className="flex items-center gap-1.5"
      >
        {Icon && <Icon />}
        <span>{item.label}</span>
      </motion.span>
      <AnimatePresence mode="popLayout" initial={false}>
        {!isNil(item.badge) && (
          <Badge
            key={item.badge}
            variant={isActive ? 'default' : 'secondary'}
            render={
              <motion.span
                initial={{opacity: 0, scale: 0.5, y: -6}}
                animate={{opacity: 1, scale: 1, y: 0}}
                exit={{opacity: 0, scale: 0.5, y: 6}}
                transition={{type: 'spring', stiffness: 500, damping: 25}}
              />
            }
          >
            {item.badge}
          </Badge>
        )}
      </AnimatePresence>
    </TabsTrigger>
  );
}

function getSlideDirection(activationDirection) {
  if (activationDirection === 'right') {
    return 1;
  }
  return activationDirection === 'left' ? -1 : 0;
}
