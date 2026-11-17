'use client';

import {ArrowLeftIcon} from 'lucide-react';
import {FieldSkeleton} from '@/components/form/field-skeleton';
import {Form, FormSkeleton} from '@/components/form/form';
import {FormGrid} from '@/components/form/form-grid';
import {SaveButton, SaveButtonSkeleton} from '@/components/form/save-button';
import {UnsavedChangesGuard} from '@/components/form/unsaved-changes-guard';
import {LinkButton} from '@/components/common/link-button';
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function PageCardForm({
  children,
  form,
  title,
  formClassName,
  colClassName,
  autoComplete = 'off',
  back = null,
  actions = <SaveButton />,
}) {
  return (
    <PageCardColumn colClassName={colClassName}>
      <Form form={form} autoComplete={autoComplete} className={formClassName}>
        <UnsavedChangesGuard />
        <PageCard title={title} back={back} actions={actions}>
          {children}
        </PageCard>
      </Form>
    </PageCardColumn>
  );
}

export function PageCardFormSkeleton({
  title,
  formClassName,
  colClassName,
  back = null,
  actions = <SaveButtonSkeleton />,
  children = <FieldSkeleton />,
}) {
  return (
    <PageCardColumn colClassName={colClassName}>
      <FormSkeleton className={formClassName}>
        <PageCard title={title} back={back} actions={actions}>
          {children}
        </PageCard>
      </FormSkeleton>
    </PageCardColumn>
  );
}

function PageCardColumn({colClassName = 'w-full max-w-2xl', children}) {
  return (
    <div className="flex justify-center">
      <div className={colClassName}>{children}</div>
    </div>
  );
}

function PageCard({title, back, actions, children}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {back && (
          <CardAction>
            <LinkButton
              variant="outline"
              size="icon-sm"
              title="Go back"
              href={back}
            >
              <ArrowLeftIcon />
            </LinkButton>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <FormGrid>{children}</FormGrid>
      </CardContent>
      {actions && <CardFooter>{actions}</CardFooter>}
    </Card>
  );
}
