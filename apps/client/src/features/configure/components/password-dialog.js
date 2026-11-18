'use client';

import {createUserConfigSessionSchema} from '@repo/shared/schemas/user-config.js';
import {WarningAlert} from '@/components/common/status-alerts';
import {FormDialog, FormPanelContent} from '@/components/form/form-panel';
import {FormField} from '@/components/form/form-field';
import {SubmitButton} from '@/components/form/submit-button';
import {TextInput} from '@/components/form/text-input';
import {useAppForm} from '@/lib/form';
import {useCreateUserConfigSession} from '../api';
import {useUserConfigSessionNotice} from '../hooks/use-user-config-session';
import {writeUserConfigSessionToken} from '../lib/user-config-session';

function PasswordForm({userConfigId, onCancel, onSignedIn}) {
  const sessionNotice = useUserConfigSessionNotice(userConfigId);
  const sessionMutation = useCreateUserConfigSession({
    onSuccess: ({data}) => {
      writeUserConfigSessionToken(userConfigId, data.sessionToken);
      onSignedIn();
    },
  });
  const form = useAppForm({
    defaultValues: {password: ''},
    schema: createUserConfigSessionSchema,
    mutation: {
      mutateAsync: ({password}) =>
        sessionMutation.mutateAsync({userConfigId, password}),
    },
  });

  return (
    <FormPanelContent
      form={form}
      onCancel={onCancel}
      actions={<SubmitButton>Continue</SubmitButton>}
    >
      {sessionNotice && (
        <WarningAlert className="col-span-12">{sessionNotice}</WarningAlert>
      )}
      <FormField name="password">
        <TextInput
          label="Password"
          type="password"
          autoComplete="current-password"
        />
      </FormField>
    </FormPanelContent>
  );
}

export function PasswordDialog({userConfigId, onClose, onSignedIn}) {
  return (
    <FormDialog open onClose={onClose} title="Enter your password">
      <PasswordForm
        userConfigId={userConfigId}
        onCancel={onClose}
        onSignedIn={onSignedIn}
      />
    </FormDialog>
  );
}
