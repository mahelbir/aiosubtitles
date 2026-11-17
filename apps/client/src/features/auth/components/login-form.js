'use client';

import {LockIcon, LogInIcon, MailIcon} from 'lucide-react';
import {loginSchema} from '@repo/shared/schemas/auth.js';
import {useAppForm} from '@/lib/form';
import {Form} from '@/components/form/form';
import {FormField} from '@/components/form/form-field';
import {SubmitButton} from '@/components/form/submit-button';
import {useLogin} from '@/api/auth';
import {AuthTextInput} from './auth-text-input';

export function LoginForm() {
  const loginMutation = useLogin();
  const form = useAppForm({
    defaultValues: {email: '', password: ''},
    schema: loginSchema,
    mutation: loginMutation,
  });

  return (
    <Form form={form}>
      <FormField name="email">
        <AuthTextInput
          icon={MailIcon}
          type="email"
          label="E-posta"
          autoComplete="email"
        />
      </FormField>
      <FormField name="password">
        <AuthTextInput
          icon={LockIcon}
          type="password"
          label="Parola"
          autoComplete="current-password"
        />
      </FormField>
      <SubmitButton size="lg" className="w-full">
        <LogInIcon data-icon="inline-start" />
        Giriş Yap
      </SubmitButton>
    </Form>
  );
}
