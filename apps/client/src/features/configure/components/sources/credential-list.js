'use client';

import {useSelector} from '@tanstack/react-form';
import {get} from 'es-toolkit/compat';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {
  ArrayItemActions,
  FilteredArrayInput,
} from '@/components/form/array-input';
import {FormField} from '@/components/form/form-field';
import {PasswordInput, TextInput} from '@/components/form/text-input';
import {FieldLegend, FieldSet} from '@/components/ui/field';
import {useFormContext} from '@/lib/form-context';
import {useStoredCredential} from '../../hooks/use-stored-credentials';
import {toCredentialFormValues} from '../../lib/credential-form-values';
import {setSubtitleSourceSwitch} from '../../lib/subtitle-source-switch-state';
import {CredentialStatusBadge} from './credential-status-badge';
import {CredentialQuota, CredentialQuotaTotal} from './opensubtitles-quota';

const CREDENTIAL_LISTS = Object.freeze({
  [CredentialKind.API_KEY]: {label: 'API keys', addLabel: 'Add API key'},
  [CredentialKind.ACCOUNT]: {label: 'Accounts', addLabel: 'Add account'},
  [CredentialKind.ACCESS_TOKEN]: {
    label: 'Access tokens',
    addLabel: 'Add access token',
  },
});

const KEY_SECRET_INPUT = Object.freeze({
  Input: PasswordInput,
  autoComplete: 'off',
  'data-1p-ignore': true,
  'data-lpignore': 'true',
});

const CREDENTIAL_SECRET_PART_INPUTS = Object.freeze({
  apiKey: {
    ...KEY_SECRET_INPUT,
    label: CredentialKind.label(CredentialKind.API_KEY),
  },
  username: {
    Input: TextInput,
    label: 'Username',
    type: 'text',
    autoComplete: 'off',
  },
  password: {
    Input: PasswordInput,
    label: 'Password',
    autoComplete: 'new-password',
  },
  accessToken: {
    ...KEY_SECRET_INPUT,
    label: CredentialKind.label(CredentialKind.ACCESS_TOKEN),
  },
});

function CredentialItem({name, index, credentialKind}) {
  const form = useFormContext();
  const credentialId = useSelector(form.store, state =>
    get(state.values, `${name}.credentialId`),
  );
  const storedCredential = useStoredCredential(credentialId);

  return (
    <FieldSet className="gap-2">
      <FieldLegend className="sr-only">
        {`${CredentialKind.label(credentialKind)} ${index + 1}`}
      </FieldLegend>
      <div className="flex items-end gap-2">
        {CredentialKind.item(credentialKind).credentialSecretParts.map(
          secretPart => {
            const {Input, ...inputProps} =
              CREDENTIAL_SECRET_PART_INPUTS[secretPart];
            return (
              <FormField
                key={secretPart}
                name={`${name}.credentialSecret.${secretPart}`}
                className="min-w-0 flex-1"
              >
                <Input {...inputProps} />
              </FormField>
            );
          },
        )}
        <ArrayItemActions />
      </div>
      {storedCredential && (
        <div className="flex flex-wrap items-center gap-2">
          <CredentialStatusBadge
            credentialStatus={storedCredential.credentialStatus}
          />
          <CredentialQuota storedCredential={storedCredential} />
        </div>
      )}
    </FieldSet>
  );
}

export function CredentialList({
  subtitleSource,
  credentialKind,
  credentialLimit,
  label,
}) {
  const form = useFormContext();
  const otherKindCount = useSelector(
    form.store,
    state =>
      state.values.credentials.filter(
        credential =>
          credential.subtitleSource === subtitleSource &&
          credential.credentialKind !== credentialKind,
      ).length,
  );
  const {label: listName, addLabel} = CREDENTIAL_LISTS[credentialKind];

  return (
    <>
      <FormField name="credentials" mode="array">
        <FilteredArrayInput
          label={label}
          aria-label={label ? undefined : listName}
          max={credentialLimit - otherKindCount}
          addLabel={addLabel}
          filter={credential =>
            credential.subtitleSource === subtitleSource &&
            credential.credentialKind === credentialKind
          }
          createItem={() => {
            setSubtitleSourceSwitch(form, subtitleSource, true);
            return toCredentialFormValues({subtitleSource, credentialKind});
          }}
        >
          {({name, index}) => (
            <CredentialItem
              name={name}
              index={index}
              credentialKind={credentialKind}
            />
          )}
        </FilteredArrayInput>
      </FormField>
      <CredentialQuotaTotal
        subtitleSource={subtitleSource}
        credentialKind={credentialKind}
      />
    </>
  );
}
