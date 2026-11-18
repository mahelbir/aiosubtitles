'use client';

import {z} from 'zod';
import {userConfigPasswordField} from '@repo/shared/schemas/user-config.js';
import {FormDialog, FormPanelContent} from '@/components/form/form-panel';
import {FormField} from '@/components/form/form-field';
import {SubmitButton} from '@/components/form/submit-button';
import {TextInput} from '@/components/form/text-input';
import {useAppForm} from '@/lib/form';
import {useCreateUserConfig} from '../api';
import {getRepeatPasswordCheck} from '../lib/repeat-password-check';
import {writeUserConfigSessionToken} from '../lib/user-config-session';

const setPasswordSchema = z
  .object({
    password: userConfigPasswordField,
    repeatPassword: z.string(),
  })
  .check(getRepeatPasswordCheck('password', 'repeatPassword'));

function SetPasswordForm({values, onCancel, onCreated}) {
  const createMutation = useCreateUserConfig({
    toast: true,
    onSuccess: ({data}) => {
      writeUserConfigSessionToken(data.userConfigId, data.sessionToken);
      onCreated(data.userConfigId);
    },
  });
  const form = useAppForm({
    defaultValues: {password: '', repeatPassword: ''},
    schema: setPasswordSchema,
    mutation: {
      mutateAsync: ({password}) =>
        createMutation.mutateAsync({...values, password}),
    },
  });

  return (
    <FormPanelContent
      form={form}
      onCancel={onCancel}
      actions={<SubmitButton>Set password</SubmitButton>}
    >
      <p className="col-span-12 text-sm text-muted-foreground">
        You need this password to change your settings later.
      </p>
      <FormField name="password">
        <TextInput
          label="Password"
          type="password"
          autoComplete="new-password"
        />
      </FormField>
      <FormField name="repeatPassword">
        <TextInput
          label="Repeat password"
          type="password"
          autoComplete="new-password"
        />
      </FormField>
    </FormPanelContent>
  );
}

export function SetPasswordDialog({values, onClose, onCreated}) {
  return (
    <FormDialog open onClose={onClose} title="Set a password">
      <SetPasswordForm
        values={values}
        onCancel={onClose}
        onCreated={onCreated}
      />
    </FormDialog>
  );
}
