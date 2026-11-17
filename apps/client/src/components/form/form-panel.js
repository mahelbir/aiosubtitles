'use client';

import {createContext, use, useEffect, useEffectEvent, useRef} from 'react';
import {cn} from 'cn';
import {Button} from '@/components/ui/button';
import {useIsMobile} from '@/components/ui/hooks/use-mobile';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {Skeleton} from '@/components/ui/skeleton';
import {FieldSkeleton} from '@/components/form/field-skeleton';
import {Form, FormSkeleton} from '@/components/form/form';
import {FormGrid} from '@/components/form/form-grid';
import {SaveButton, SaveButtonSkeleton} from '@/components/form/save-button';
import {UnsavedChangesGuard} from '@/components/form/unsaved-changes-guard';
import {appAlert} from '@/lib/app-alert';
import {focusFirstField, hasUnsavedChanges} from '@/lib/form';
import {glideHeightOnSwap} from '@/lib/height-motion';

const SPLIT_FOOTER_CLASS = 'grid auto-cols-fr grid-flow-col *:w-full';

const SHEET_PANEL = {
  Root: Sheet,
  Content: SheetContent,
  Header: SheetHeader,
  Title: SheetTitle,
  Footer: SheetFooter,
  rootProps: {},
  bodyClassName: 'px-4',
  footerClassName: SPLIT_FOOTER_CLASS,
};

const DRAWER_PANEL = {
  Root: Drawer,
  Content: DrawerContent,
  Header: DrawerHeader,
  Title: DrawerTitle,
  Footer: DrawerFooter,
  rootProps: {showSwipeHandle: true},
  bodyClassName: 'px-4',
  footerClassName: SPLIT_FOOTER_CLASS,
};

const DIALOG_PANEL = {
  Root: Dialog,
  Content: DialogContent,
  Header: DialogHeader,
  Title: DialogTitle,
  Footer: DialogFooter,
  rootProps: {},
  bodyClassName: null,
  footerClassName: null,
};

const PANEL_CONTENT_CLASS = 'flex min-h-0 flex-1 flex-col';

const FormPanelContext = createContext(SHEET_PANEL);

export function FormPanel({size, ...props}) {
  return (
    <ResponsivePanel
      desktopPanel={SHEET_PANEL}
      desktopContentProps={{size}}
      {...props}
    />
  );
}

export function FormDialog({size, ...props}) {
  return (
    <ResponsivePanel
      desktopPanel={DIALOG_PANEL}
      desktopContentProps={{position: 'top', size}}
      {...props}
    />
  );
}

function isFromAnotherDialog(event) {
  return (
    event?.target instanceof Element &&
    Boolean(event.target.closest('[role="alertdialog"]'))
  );
}

function confirmDiscard(form) {
  if (!form || !hasUnsavedChanges(form.state)) {
    return true;
  }
  return appAlert.confirmDangerous('You have unsaved changes.', {
    description: 'If you close, your changes will be lost.',
    confirmButtonText: 'Close',
  });
}

function ResponsivePanel({
  desktopPanel,
  desktopContentProps,
  open,
  onClose,
  title,
  children,
}) {
  const isMobile = useIsMobile();
  const panel = isMobile ? DRAWER_PANEL : desktopPanel;
  const formRef = useRef(null);
  const openFocusRef = useRef(null);
  const isConfirmingRef = useRef(false);

  const recordOpenFocus = event => {
    if (openFocusRef.current?.popup !== event.currentTarget) {
      openFocusRef.current = {popup: event.currentTarget, target: event.target};
    }
  };

  const focusLandedForm = () => {
    const {popup, target} = openFocusRef.current ?? {};
    if (target !== popup && document.activeElement === target) {
      focusFirstField(popup);
    }
  };

  const runAfterDiscard = async action => {
    if (isConfirmingRef.current) {
      return;
    }
    isConfirmingRef.current = true;
    try {
      if (await confirmDiscard(formRef.current)) {
        action();
      }
    } finally {
      isConfirmingRef.current = false;
    }
  };

  return (
    <FormPanelContext.Provider
      value={{...panel, formRef, runAfterDiscard, focusLandedForm}}
    >
      <panel.Root
        open={open}
        onOpenChange={(opened, eventDetails) =>
          !opened &&
          !isFromAnotherDialog(eventDetails.event) &&
          runAfterDiscard(onClose)
        }
        {...panel.rootProps}
      >
        <panel.Content
          onFocus={recordOpenFocus}
          {...(isMobile ? null : desktopContentProps)}
        >
          <panel.Header>
            <panel.Title>{title}</panel.Title>
          </panel.Header>
          <div
            ref={glideHeightOnSwap}
            className="flex min-h-0 flex-auto flex-col"
          >
            {children}
          </div>
        </panel.Content>
      </panel.Root>
    </FormPanelContext.Provider>
  );
}

export function FormPanelContent({
  form,
  children,
  onCancel,
  autoComplete = 'off',
  actions = <SaveButton align="start" />,
}) {
  const {formRef, runAfterDiscard, focusLandedForm} = use(FormPanelContext);
  const onLanded = useEffectEvent(focusLandedForm);

  useEffect(() => {
    formRef.current = form;
    return () => {
      if (formRef.current === form) {
        formRef.current = null;
      }
    };
  }, [formRef, form]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(onLanded);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <Form
      form={form}
      autoComplete={autoComplete}
      className={PANEL_CONTENT_CLASS}
    >
      <UnsavedChangesGuard />
      <PanelBody
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => runAfterDiscard(onCancel)}
            >
              Cancel
            </Button>
            {actions}
          </>
        }
      >
        {children}
      </PanelBody>
    </Form>
  );
}

export function FormPanelContentSkeleton({
  actions = <SaveButtonSkeleton align="start" />,
  children = <FieldSkeleton />,
}) {
  return (
    <FormSkeleton className={PANEL_CONTENT_CLASS}>
      <PanelBody
        footer={
          <>
            <Skeleton className="h-8 w-20" />
            {actions}
          </>
        }
      >
        {children}
      </PanelBody>
    </FormSkeleton>
  );
}

function PanelBody({footer, children}) {
  const {Footer, bodyClassName, footerClassName} = use(FormPanelContext);

  return (
    <>
      <FormGrid
        className={cn(
          'min-h-0 flex-1 content-start overflow-y-auto',
          bodyClassName,
        )}
      >
        {children}
      </FormGrid>
      <Footer className={footerClassName}>{footer}</Footer>
    </>
  );
}
