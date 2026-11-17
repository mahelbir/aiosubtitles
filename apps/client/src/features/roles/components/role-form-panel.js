'use client';

import {Permission} from '@repo/shared/constants/permission.js';
import {RolePlacement} from '@repo/shared/constants/role.js';
import {createRoleSchema, updateRoleSchema} from '@repo/shared/schemas/role.js';
import {
  FormPanel,
  FormPanelContent,
  FormPanelContentSkeleton,
} from '@/components/form/form-panel';
import {FieldSkeleton} from '@/components/form/field-skeleton';
import {FormField} from '@/components/form/form-field';
import {TextInput} from '@/components/form/text-input';
import {ToggleGroupInput} from '@/components/form/toggle-group-input';
import {CheckboxGroupInput} from '@/components/form/checkbox-group-input';
import {PanelEntityBoundary} from '@/components/common/entity-boundary';
import {ErrorAlert} from '@/components/common/status-alerts';
import {PanelAction, usePanelQuery} from '@/hooks/use-panel-query';
import {useAuthorization} from '@/hooks/use-authorization';
import {useAppForm} from '@/lib/form';
import {optionSource} from '@/lib/option-source';
import {useCreateRole, useRole, useUpdateRole} from '../api';

const PLACEMENT_ABILITY = {
  [RolePlacement.ABOVE]: 'addAbove',
  [RolePlacement.SAME]: 'addSame',
  [RolePlacement.BELOW]: 'addBelow',
};

export function RoleFormPanel() {
  const formPanel = usePanelQuery();
  const roleQuery = useRole(formPanel.targetId);

  return (
    <FormPanel
      open={formPanel.isOpen}
      onClose={formPanel.close}
      title={formPanel.action === PanelAction.EDIT ? 'Rol Düzenle' : 'Rol Ekle'}
    >
      <PanelEntityBoundary
        id={formPanel.targetId}
        query={roleQuery}
        onClose={formPanel.close}
        className="px-4"
        pending={
          <FormPanelContentSkeleton>
            <FieldSkeleton />
            <FieldSkeleton />
            <FieldSkeleton />
          </FormPanelContentSkeleton>
        }
      >
        {role =>
          role && !role.viewerCan?.update ? (
            <ErrorAlert className="mx-4">
              Bu rol üzerinde işlem yapamazsınız.
            </ErrorAlert>
          ) : (
            <Form
              key={role?.id ?? formPanel.anchorId ?? 'new'}
              role={role}
              anchorId={role?.anchorRoleId ?? formPanel.anchorId}
              onDone={formPanel.close}
            />
          )
        }
      </PanelEntityBoundary>
    </FormPanel>
  );
}

function Form({role, anchorId, onDone}) {
  const isEdit = Boolean(role);
  const {can} = useAuthorization();
  const anchorQuery = useRole(anchorId);
  const anchor = anchorQuery.data;

  const placementOptions = RolePlacement.toList({
    extra: ({value}) => ({
      disabled: !anchor?.viewerCan?.[PLACEMENT_ABILITY[value]],
    }),
  });

  const permissionOptions = Permission.toList({
    extra: ({value, raw}) => ({
      group: raw.group,
      disabled: !can({grant: [value]}),
    }),
  }).filter(
    ({value}) => can({grant: [value]}) || role?.permissions?.includes(value),
  );
  const permissionSource = optionSource.fixed(permissionOptions);

  const createMutation = useCreateRole({toast: true, onSuccess: onDone});
  const updateMutation = useUpdateRole({toast: true, onSuccess: onDone});

  const form = useAppForm({
    defaultValues: {
      label: role?.label ?? '',
      slug: role?.slug ?? '',
      anchorRoleId: anchorId ?? null,
      placement: role?.placement ?? RolePlacement.BELOW,
      permissions: role?.permissions ?? [],
    },
    schema: isEdit ? updateRoleSchema : createRoleSchema,
    mutation: {
      mutateAsync: values =>
        isEdit
          ? updateMutation.mutateAsync({id: role.id, values})
          : createMutation.mutateAsync(values),
    },
  });

  return (
    <FormPanelContent form={form} onCancel={onDone}>
      <FormField name="label">
        <TextInput label="Ad" />
      </FormField>
      <FormField name="slug">
        <TextInput label="Anahtar" />
      </FormField>
      {anchor && (
        <FormField name="placement">
          <ToggleGroupInput
            label="Konum"
            options={placementOptions}
            help={`"${anchor.label}" rolüne göre`}
          />
        </FormField>
      )}
      <FormField name="permissions">
        <CheckboxGroupInput label="İzinler" source={permissionSource} />
      </FormField>
    </FormPanelContent>
  );
}
