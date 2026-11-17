'use client';

import {LockIcon, UserIcon} from 'lucide-react';
import {z} from 'zod';
import {getCrossFieldCheck} from '@repo/shared/schemas/common.js';
import {
  changePasswordSchema,
  updateProfileSchema,
} from '@repo/shared/schemas/user.js';
import {FieldSkeleton} from '@/components/form/field-skeleton';
import {FormField} from '@/components/form/form-field';
import {FormGrid} from '@/components/form/form-grid';
import {SaveButton, SaveButtonSkeleton} from '@/components/form/save-button';
import {TabMenuForm} from '@/components/form/tab-menu-form';
import {TextInput} from '@/components/form/text-input';
import {QueryBoundary} from '@/components/common/query-boundary';
import {TabMenuCard, TabMenuPanelSkeleton} from '@/components/common/tab-menu';
import {useTabQuery} from '@/hooks/use-tab-query';
import {useAppForm} from '@/lib/form';
import {useChangePassword, useProfile, useUpdateProfile} from '../api';

const USER_TAB_LABEL = 'Profil Bilgileri';

const userFormSchema = updateProfileSchema.required({email: true});

const passwordFormSchema = changePasswordSchema
  .extend({passwordAgain: z.string('Parola tekrarı gereklidir')})
  .check(
    getCrossFieldCheck(
      ['password', 'passwordAgain'],
      values => values.password === values.passwordAgain,
      {message: 'Parolalar eşleşmiyor', path: ['passwordAgain']},
    ),
  );

function UserFormProvider({profile, children}) {
  const updateMutation = useUpdateProfile();

  const form = useAppForm({
    defaultValues: {email: profile.email},
    schema: userFormSchema,
    mutation: updateMutation,
  });

  return <TabMenuForm form={form}>{children}</TabMenuForm>;
}

function UserWrapper({children}) {
  const profileQuery = useProfile();
  return (
    <QueryBoundary query={profileQuery} pending={<UserPanelSkeleton />}>
      {profile => (
        <UserFormProvider profile={profile}>{children}</UserFormProvider>
      )}
    </QueryBoundary>
  );
}

function UserPanelSkeleton() {
  return (
    <TabMenuPanelSkeleton
      label={USER_TAB_LABEL}
      actions={<SaveButtonSkeleton />}
    >
      <FormGrid>
        <FieldSkeleton />
      </FormGrid>
    </TabMenuPanelSkeleton>
  );
}

function UserPanel() {
  return (
    <FormField name="email" className="col-span-12">
      <TextInput label="E-posta" type="email" autoComplete="email" />
    </FormField>
  );
}

function PasswordWrapper({children}) {
  const changeMutation = useChangePassword({
    toast: true,
    onSuccess: () => form.reset(),
  });

  const form = useAppForm({
    defaultValues: {currentPassword: '', password: '', passwordAgain: ''},
    schema: passwordFormSchema,
    mutation: {
      mutateAsync: ({currentPassword, password}) =>
        changeMutation.mutateAsync({currentPassword, password}),
    },
  });

  return (
    <TabMenuForm form={form} autoComplete="off">
      {children}
    </TabMenuForm>
  );
}

function PasswordPanel() {
  return (
    <>
      <FormField name="currentPassword" className="col-span-12">
        <TextInput
          label="Mevcut Parola"
          type="password"
          autoComplete="current-password"
        />
      </FormField>
      <FormField
        name="password"
        className="col-span-12 @md/field-group:col-span-6"
      >
        <TextInput
          label="Yeni Parola"
          type="password"
          autoComplete="new-password"
        />
      </FormField>
      <FormField
        name="passwordAgain"
        className="col-span-12 @md/field-group:col-span-6"
      >
        <TextInput
          label="Yeni Parola (Tekrar)"
          type="password"
          autoComplete="new-password"
        />
      </FormField>
    </>
  );
}

const PROFILE_TABS = [
  {
    value: 'user',
    label: USER_TAB_LABEL,
    Icon: UserIcon,
    Wrapper: UserWrapper,
    Panel: UserPanel,
  },
  {
    value: 'password',
    label: 'Parola Değiştir',
    Icon: LockIcon,
    Wrapper: PasswordWrapper,
    Panel: PasswordPanel,
  },
];

export function ProfilePage() {
  const [activeTab, setActiveTab] = useTabQuery(PROFILE_TABS);

  return (
    <TabMenuCard
      items={PROFILE_TABS}
      value={activeTab}
      onValueChange={setActiveTab}
      footer={<SaveButton />}
      className="mx-auto w-full max-w-4xl md:min-h-72"
    >
      {tab => (
        <FormGrid>
          <tab.Panel />
        </FormGrid>
      )}
    </TabMenuCard>
  );
}
