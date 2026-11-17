'use client';

import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  InfoIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import {cn} from 'cn';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {useAppAlertStore} from '@/stores/app-alert-store';
import {Spinner} from '@/components/ui/spinner';
import {LOADING_LABEL} from '@/components/common/loading-status';

const TYPES = {
  default: {},
  info: {Icon: InfoIcon, variant: 'primary'},
  success: {Icon: CircleCheckIcon, variant: 'success'},
  error: {Icon: CircleAlertIcon, variant: 'destructive'},
  warning: {Icon: TriangleAlertIcon, variant: 'warning'},
  confirm: {Icon: CircleHelpIcon, variant: 'secondary'},
  dangerous: {
    Icon: TriangleAlertIcon,
    variant: 'destructive',
    destructive: true,
  },
};

export function AppAlertContainer() {
  const alert = useAppAlertStore(state => state.alert);
  const isPending = useAppAlertStore(state => state.isPending);
  const confirm = useAppAlertStore(state => state.confirm);
  const close = useAppAlertStore(state => state.close);
  const type = TYPES[alert?.type] ?? TYPES.confirm;
  const {Icon} = type;

  return (
    <AlertDialog
      open={Boolean(alert)}
      onOpenChange={open => {
        if (!open) {
          close(false);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader className={cn(Icon && 'sm:grid-cols-[auto_1fr]')}>
          {Icon && (
            <AlertDialogMedia variant={type.variant}>
              <Icon />
            </AlertDialogMedia>
          )}
          <AlertDialogTitle>{alert?.title}</AlertDialogTitle>
          {alert?.description && (
            <AlertDialogDescription>{alert.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          {alert?.showCancel && (
            <AlertDialogCancel
              disabled={isPending}
              onClick={() => close(false)}
            >
              {alert.cancelText}
            </AlertDialogCancel>
          )}
          <AlertDialogAction
            variant={type.destructive ? 'destructive' : 'default'}
            disabled={isPending}
            onClick={confirm}
          >
            {isPending && <Spinner aria-label={LOADING_LABEL} />}
            {(isPending && alert?.pending) || alert?.confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
