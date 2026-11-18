'use client';

import {LogInIcon} from 'lucide-react';
import {ErrorCode} from '@repo/shared/constants/error-code.js';
import {withQuery} from '@repo/shared/lib/url-query.js';
import {getUuidField} from '@repo/shared/schemas/common.js';
import {createUserConfigSessionSchema} from '@repo/shared/schemas/user-config.js';
import {LinkButton} from '@/components/common/link-button';
import {ErrorAlert, WarningAlert} from '@/components/common/status-alerts';
import {Form} from '@/components/form/form';
import {FormField} from '@/components/form/form-field';
import {FormGrid} from '@/components/form/form-grid';
import {SubmitButton} from '@/components/form/submit-button';
import {TextInput} from '@/components/form/text-input';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {useAppForm} from '@/lib/form';
import {useCreateUserConfigSession} from '../api';
import {
  CONFIGURE_PATH,
  SIGN_IN_VIEW,
  useConfigureQuery,
} from '../hooks/use-configure-query';
import {useUserConfigSessionNotice} from '../hooks/use-user-config-session';
import {writeUserConfigSessionToken} from '../lib/user-config-session';

const signInSchema = createUserConfigSessionSchema.extend({
  userConfigId: getUuidField('Enter a valid configuration ID'),
});

function isShownSignInError(error) {
  return Boolean(error) && error.errorCode !== ErrorCode.VALIDATION_ERROR;
}

function NewUserConfigLink() {
  return (
    <LinkButton variant="link" href={CONFIGURE_PATH}>
      Create a new configuration
    </LinkButton>
  );
}

function UserConfigSignInCard({
  defaultUserConfigId,
  readOnly,
  description,
  notice,
  footer,
}) {
  const [, setConfigureQuery] = useConfigureQuery();
  const sessionMutation = useCreateUserConfigSession({
    toast: false,
    onSuccess: ({data}, {userConfigId}) => {
      writeUserConfigSessionToken(userConfigId, data.sessionToken);
      setConfigureQuery({userConfigId, view: null});
    },
  });
  const form = useAppForm({
    defaultValues: {userConfigId: defaultUserConfigId, password: ''},
    schema: signInSchema,
    mutation: {
      mutateAsync: ({userConfigId, password}) =>
        sessionMutation.mutateAsync({
          userConfigId: userConfigId.toLowerCase(),
          password,
        }),
    },
  });

  return (
    <Card className="mx-4 mt-6 sm:mx-auto sm:w-full sm:max-w-md md:mt-16">
      <CardHeader>
        <CardTitle>Open your configuration</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {notice && <WarningAlert>{notice}</WarningAlert>}
        {isShownSignInError(sessionMutation.error) && (
          <ErrorAlert>{sessionMutation.error.message}</ErrorAlert>
        )}
        <Form form={form} aria-label="Open your configuration">
          <FormGrid>
            <FormField name="userConfigId">
              <TextInput
                label="Configuration ID"
                autoComplete="username"
                spellCheck={false}
                readOnly={readOnly}
              />
            </FormField>
            <FormField name="password">
              <TextInput
                label="Password"
                type="password"
                autoComplete="current-password"
              />
            </FormField>
          </FormGrid>
          <SubmitButton className="w-full">
            <LogInIcon data-icon="inline-start" />
            Open configuration
          </SubmitButton>
        </Form>
      </CardContent>
      <CardFooter className="flex flex-wrap justify-center gap-x-4">
        {footer}
      </CardFooter>
    </Card>
  );
}

export function SignInCard({userConfigId}) {
  const sessionNotice = useUserConfigSessionNotice(userConfigId);

  return (
    <UserConfigSignInCard
      defaultUserConfigId={userConfigId}
      readOnly
      description="Enter your password to change your subtitle settings."
      notice={sessionNotice}
      footer={
        <>
          <LinkButton
            variant="link"
            href={withQuery(CONFIGURE_PATH, {view: SIGN_IN_VIEW})}
          >
            Open another configuration
          </LinkButton>
          <NewUserConfigLink />
        </>
      }
    />
  );
}

export function OpenUserConfigCard() {
  return (
    <UserConfigSignInCard
      defaultUserConfigId=""
      description="Enter your configuration ID and password."
      footer={<NewUserConfigLink />}
    />
  );
}
