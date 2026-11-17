'use client';

import {CircleAlertIcon, TriangleAlertIcon} from 'lucide-react';
import {cn} from 'cn';
import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';

function StatusAlert({
  variant,
  icon: Icon,
  title,
  actions = null,
  children,
  className,
}) {
  return (
    <Alert variant={variant} className={className}>
      <Icon />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription
        className={cn(
          actions && 'flex flex-wrap items-center justify-between gap-2',
        )}
      >
        {children}
        {actions && <AlertActions>{actions}</AlertActions>}
      </AlertDescription>
    </Alert>
  );
}

export function ErrorAlert(props) {
  return (
    <StatusAlert {...props} variant="destructive" icon={CircleAlertIcon} />
  );
}

export function WarningAlert(props) {
  return <StatusAlert {...props} variant="warning" icon={TriangleAlertIcon} />;
}
