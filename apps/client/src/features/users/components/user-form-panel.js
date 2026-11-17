'use client';

import {pick} from 'es-toolkit';
import {
  createUserSchema,
  updateSelfSchema,
  updateUserSchema,
} from '@repo/shared/schemas/user.js';
import {isSelf} from '@repo/shared/lib/authorization.js';
import {
  FormPanel,
  FormPanelContent,
  FormPanelContentSkeleton,
} from '@/components/form/form-panel';
import {
  CheckboxFieldSkeleton,
  FieldSkeleton,
} from '@/components/form/field-skeleton';
import {FormField} from '@/components/form/form-field';
import {TextInput} from '@/components/form/text-input';
import {MultiSelectInput} from '@/components/form/multi-select-input';
import {TimestampCheckbox} from '@/components/form/timestamp-checkbox';
import {PanelEntityBoundary} from '@/components/common/entity-boundary';
import {ErrorAlert} from '@/components/common/status-alerts';
import {PanelAction, usePanelQuery} from '@/hooks/use-panel-query';
import {
  roleOptionSource,
  toRoleOption,
  useRoleOptions,
} from '@/api/role-options';
import {getBlankableSchema, omitBlankFields, useAppForm} from '@/lib/form';
import {useAuthStore} from '@/stores/auth-store';
import {useCreateUser, useUpdateUser, useUser} from '../api';

const WRITE_ONLY_KEYS = ['password'];

const editUserSchema = getBlankableSchema(updateUserSchema, WRITE_ONLY_KEYS);
const editSelfSchema = getBlankableSchema(updateSelfSchema, WRITE_ONLY_KEYS);

function schemaFor(principal, user) {
  if (!user) {
    return createUserSchema;
  }
  return isSelf(principal, user) ? editSelfSchema : editUserSchema;
}

export function UserFormPanel() {
  const formPanel = usePanelQuery();
  const userQuery = useUser(formPanel.targetId);
  const principal = useAuthStore(state => state.principal);
  const isSelfTarget = isSelf(principal, {id: formPanel.targetId});

  return (
    <FormPanel
      open={formPanel.isOpen}
      onClose={formPanel.close}
      title={
        formPanel.action === PanelAction.EDIT
          ? 'Kullanıcı Düzenle'
          : 'Kullanıcı Ekle'
      }
    >
      <PanelEntityBoundary
        id={formPanel.targetId}
        query={userQuery}
        onClose={formPanel.close}
        className="px-4"
        pending={
          <FormPanelContentSkeleton>
            <FieldSkeleton />
            <FieldSkeleton />
            {!isSelfTarget && (
              <>
                <FieldSkeleton />
                <CheckboxFieldSkeleton />
              </>
            )}
          </FormPanelContentSkeleton>
        }
      >
        {user =>
          user && !user.viewerCan?.update ? (
            <ErrorAlert className="mx-4">
              Bu kullanıcı üzerinde işlem yapamazsınız.
            </ErrorAlert>
          ) : (
            <Form
              key={`${user?.id ?? 'new'}:${principal?.id ?? ''}`}
              user={user}
              onDone={formPanel.close}
            />
          )
        }
      </PanelEntityBoundary>
    </FormPanel>
  );
}

function Form({user, onDone}) {
  const isEdit = Boolean(user);
  const principal = useAuthStore(state => state.principal);
  const schema = schemaFor(principal, user);
  const fields = Object.keys(schema.shape);
  const hasField = name => fields.includes(name);

  const roleOptionsQuery = useRoleOptions({enabled: hasField('roleIds')});
  const assignableIds = new Set(
    (roleOptionsQuery.data ?? []).map(option => option.value),
  );
  const knownRoles = (user?.roles ?? []).map(toRoleOption).map(option => ({
    ...option,
    disabled: !assignableIds.has(option.value),
  }));
  const createMutation = useCreateUser({toast: true, onSuccess: onDone});
  const updateMutation = useUpdateUser({toast: true, onSuccess: onDone});

  const form = useAppForm({
    defaultValues: pick(
      {
        email: user?.email ?? '',
        password: '',
        roleIds: user?.roles?.map(role => role.id) ?? [],
        disabledAt: user?.disabledAt ?? null,
      },
      fields,
    ),
    schema,
    mutation: {
      mutateAsync: values =>
        isEdit
          ? updateMutation.mutateAsync({
              id: user.id,
              values: omitBlankFields(values, WRITE_ONLY_KEYS),
            })
          : createMutation.mutateAsync(values),
    },
  });

  return (
    <FormPanelContent form={form} onCancel={onDone}>
      {hasField('email') && (
        <FormField name="email">
          <TextInput label="E-posta" type="email" autoComplete="email" />
        </FormField>
      )}
      {hasField('password') && (
        <FormField name="password">
          <TextInput
            label="Parola"
            type="password"
            autoComplete="new-password"
          />
        </FormField>
      )}
      {hasField('roleIds') && (
        <FormField name="roleIds">
          <MultiSelectInput
            label="Roller"
            source={roleOptionSource}
            knownOptions={knownRoles}
          />
        </FormField>
      )}
      {hasField('disabledAt') && (
        <FormField name="disabledAt">
          <TimestampCheckbox label="Aktif Kullanıcı" isCheckedWhenEmpty />
        </FormField>
      )}
    </FormPanelContent>
  );
}
