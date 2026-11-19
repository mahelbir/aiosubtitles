'use client';

import {z} from 'zod';
import {changeUserConfigPasswordSchema} from '@repo/shared/schemas/user-config.js';
import {Form} from '@/components/form/form';
import {FormField} from '@/components/form/form-field';
import {FormGrid} from '@/components/form/form-grid';
import {SubmitButton} from '@/components/form/submit-button';
import {TextInput} from '@/components/form/text-input';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {useAppForm} from '@/lib/form';
import {useChangeUserConfigPassword} from '../../api';
import {useLoadedUserConfig} from '../../hooks/use-loaded-user-config';
import {getRepeatPasswordCheck} from '../../lib/repeat-password-check';
import {writeUserConfigSessionToken} from '../../lib/user-config-session';

const changePasswordSchema = changeUserConfigPasswordSchema
  .extend({repeatNewPassword: z.string()})
  .check(getRepeatPasswordCheck('newPassword', 'repeatNewPassword'));

const HALF_FIELD_CLASS = 'col-span-12 @md/field-group:col-span-6';

export function ChangePasswordCard() {
  const {userConfigId} = useLoadedUserConfig();
  const changeMutation = useChangeUserConfigPassword({
    toast: true,
    onSuccess: changed => {
      if (changed) {
        writeUserConfigSessionToken(userConfigId, changed.data.sessionToken);
        form.reset();
      }
    },
  });
  const form = useAppForm({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      repeatNewPassword: '',
    },
    schema: changePasswordSchema,
    mutation: {
      mutateAsync: ({currentPassword, newPassword}) =>
        changeMutation.mutateAsync({currentPassword, newPassword}),
    },
  });

  return (
    <Form form={form} aria-label="Change password" autoComplete="off">
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <FormGrid>
            <FormField name="currentPassword">
              <TextInput
                label="Current password"
                type="password"
                autoComplete="current-password"
              />
            </FormField>
            <FormField name="newPassword" className={HALF_FIELD_CLASS}>
              <TextInput
                label="New password"
                type="password"
                autoComplete="new-password"
              />
            </FormField>
            <FormField name="repeatNewPassword" className={HALF_FIELD_CLASS}>
              <TextInput
                label="Repeat new password"
                type="password"
                autoComplete="new-password"
              />
            </FormField>
          </FormGrid>
        </CardContent>
        <CardFooter>
          <SubmitButton>Change password</SubmitButton>
        </CardFooter>
      </Card>
    </Form>
  );
}
