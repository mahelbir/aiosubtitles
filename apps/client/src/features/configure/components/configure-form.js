'use client';

import {useId, useState} from 'react';
import {flushSync} from 'react-dom';
import {useSelector} from '@tanstack/react-form';
import {pick} from 'es-toolkit';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SUBTITLE_LANGUAGE_LIMIT_DEFAULT} from '@repo/shared/constants/user-config.js';
import {
  createUserConfigSchema,
  updateUserConfigSchema,
} from '@repo/shared/schemas/user-config.js';
import {Form} from '@/components/form/form';
import {UnsavedChangesGuard} from '@/components/form/unsaved-changes-guard';
import {SettingsLayout} from '@/components/layout/settings/settings-layout';
import {useTabQuery} from '@/hooks/use-tab-query';
import {hasUnsavedChanges, useAppForm} from '@/lib/form';
import {useUpdateUserConfig} from '../api';
import {
  CONFIGURE_SECTIONS,
  ConfigureSection,
  findFieldSection,
} from '../config/configure-sections';
import {useConfigureQuery} from '../hooks/use-configure-query';
import {useUserConfigSessionToken} from '../hooks/use-user-config-session';
import {InstallSection, NewInstallSection} from './install-section';
import {LanguagesSection} from './languages-section';
import {PasswordDialog} from './password-dialog';
import {SetPasswordDialog} from './set-password-dialog';
import {SourcesSection} from './sources-section';

const newUserConfigSchema = createUserConfigSchema.omit({password: true});

const NEW_USER_CONFIG_VALUES = {
  languageCodes: [],
  subtitleLanguageLimit: SUBTITLE_LANGUAGE_LIMIT_DEFAULT,
  subtitleSourceSwitchStates: {},
  credentials: [],
};

function toBlankCredentialSecret(credentialKind) {
  return Object.fromEntries(
    CredentialKind.item(credentialKind).credentialSecretParts.map(
      credentialSecretPart => [credentialSecretPart, ''],
    ),
  );
}

function toFormValues(userConfig) {
  return {
    ...pick(userConfig, [
      'languageCodes',
      'subtitleLanguageLimit',
      'subtitleSourceSwitchStates',
    ]),
    credentials: userConfig.credentials.map(
      ({credentialId, subtitleSource, credentialKind}) => ({
        credentialId,
        subtitleSource,
        credentialKind,
        credentialSecret: toBlankCredentialSecret(credentialKind),
      }),
    ),
  };
}

function ConfigureFormLayout({
  form,
  formId,
  schema,
  savedText,
  installSection,
}) {
  const [activeSection, setActiveSection] = useTabQuery(CONFIGURE_SECTIONS);
  const isDirty = useSelector(form.store, hasUnsavedChanges);
  const isSaving = useSelector(form.store, state => state.isSubmitting);

  const revealIssueSection = () => {
    const [issue] = schema.safeParse(form.state.values).error?.issues ?? [];
    const issueSection = issue && findFieldSection(issue.path[0]);
    if (issueSection && issueSection.value !== activeSection) {
      flushSync(() => setActiveSection(issueSection.value));
    }
  };

  return (
    <SettingsLayout
      title="Subtitle settings"
      description="Choose where subtitles come from and in which languages."
      sections={CONFIGURE_SECTIONS}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      isDirty={isDirty}
      isSaving={isSaving}
      formId={formId}
      savedText={savedText}
    >
      <Form
        form={form}
        id={formId}
        aria-label="Subtitle settings"
        onBeforeSubmit={revealIssueSection}
      >
        <UnsavedChangesGuard />
        {activeSection === ConfigureSection.SOURCES && <SourcesSection />}
        {activeSection === ConfigureSection.LANGUAGES && <LanguagesSection />}
        {activeSection === ConfigureSection.INSTALL && installSection}
      </Form>
    </SettingsLayout>
  );
}

export function NewConfigureForm() {
  const formId = useId();
  const [pendingValues, setPendingValues] = useState(null);
  const [, setConfigureQuery] = useConfigureQuery();
  const [, setActiveSection] = useTabQuery(CONFIGURE_SECTIONS);
  const form = useAppForm({
    defaultValues: NEW_USER_CONFIG_VALUES,
    schema: newUserConfigSchema,
    onSubmit: ({value}) => setPendingValues(value),
  });

  const openCreated = userConfigId => {
    setPendingValues(null);
    setConfigureQuery({userConfigId, view: null});
    setActiveSection(ConfigureSection.INSTALL);
  };

  return (
    <>
      <ConfigureFormLayout
        form={form}
        formId={formId}
        schema={newUserConfigSchema}
        savedText="Not saved yet"
        installSection={<NewInstallSection />}
      />
      {pendingValues && (
        <SetPasswordDialog
          values={pendingValues}
          onClose={() => setPendingValues(null)}
          onCreated={openCreated}
        />
      )}
    </>
  );
}

export function LoadedConfigureForm({userConfig}) {
  const {userConfigId} = userConfig;
  const formId = useId();
  const sessionToken = useUserConfigSessionToken(userConfigId);
  const [isRetryPending, setIsRetryPending] = useState(false);
  const [isPasswordDialogDismissed, setIsPasswordDialogDismissed] =
    useState(false);
  const updateMutation = useUpdateUserConfig(userConfigId);
  const form = useAppForm({
    defaultValues: toFormValues(userConfig),
    schema: updateUserConfigSchema,
    mutation: {
      mutateAsync: async values => {
        const saved = await updateMutation.mutateAsync(values);
        if (saved === null) {
          setIsRetryPending(true);
          setIsPasswordDialogDismissed(false);
        }
        return saved;
      },
    },
  });

  const retrySave = () => {
    if (!isRetryPending) {
      return;
    }
    setIsRetryPending(false);
    document.getElementById(formId)?.requestSubmit();
  };

  return (
    <>
      <ConfigureFormLayout
        form={form}
        formId={formId}
        schema={updateUserConfigSchema}
        installSection={<InstallSection manifestUrl={userConfig.manifestUrl} />}
      />
      {!sessionToken && !isPasswordDialogDismissed && (
        <PasswordDialog
          userConfigId={userConfigId}
          onClose={() => setIsPasswordDialogDismissed(true)}
          onSignedIn={retrySave}
        />
      )}
    </>
  );
}
