'use client';

import {useMemo} from 'react';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  LockIcon,
  PlusIcon,
  SquarePenIcon,
  Trash2Icon,
} from 'lucide-react';
import {toast} from 'react-toastify';
import {RoleDirection} from '@repo/shared/constants/role.js';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {PageHeader} from '@/components/common/page-header';
import {actionsColumn} from '@/components/table/actions-column';
import {DataTable} from '@/components/table/data-table';
import {TablePagination} from '@/components/table/table-pagination';
import {TableProvider} from '@/components/table/table-provider';
import {TableSearchInput} from '@/components/table/table-search';
import {TableToolbar} from '@/components/table/table-toolbar';
import {usePanelQuery} from '@/hooks/use-panel-query';
import {useFlash} from '@/hooks/use-flash';
import {useListQuery} from '@/hooks/use-list-query';
import {appAlert} from '@/lib/app-alert';
import {useDeleteRole, useMoveRole, useRoles} from '../api';
import {RoleFormPanel} from './role-form-panel';

export function RolesPage() {
  const list = useListQuery();
  const rolesQuery = useRoles(list.query);
  const formPanel = usePanelQuery();
  const deleteMutation = useDeleteRole({
    toast: false,
    onSuccess: () => toast.success('Rol silindi.'),
  });
  const rowFlash = useFlash();
  const moveMutation = useMoveRole({
    onSuccess: (data, variables) => rowFlash.flash(variables.id),
    onError: error => toast.error(error.message),
  });

  const deleteRole = deleteMutation.mutateAsync;
  const moveRole = moveMutation.mutate;
  const isMoving = moveMutation.isPending;
  const {open, openNear} = formPanel;

  const columns = useMemo(() => {
    const handleDelete = role =>
      appAlert.confirmDangerous(`"${role.label}" rolü silinsin mi?`, {
        pending: 'Siliniyor…',
        onConfirm: () => deleteRole(role.id),
        error: ({cause}) => cause.message,
      });

    return [
      {
        accessorKey: 'rank',
        header: 'Derece',
        meta: {className: 'w-0', skeleton: 'w-6'},
        cell: ({getValue}) => (
          <span className="text-muted-foreground tabular-nums">
            {getValue()}
          </span>
        ),
      },
      {
        accessorKey: 'label',
        header: 'Ad',
        cell: ({row, getValue}) => (
          <span className="flex items-center gap-2">
            {getValue()}
            {row.original.isLocked && (
              <LockIcon
                role="img"
                aria-label="Kilitli"
                className="size-3.5 text-muted-foreground"
              />
            )}
          </span>
        ),
      },
      {
        accessorKey: 'slug',
        header: 'Anahtar',
        cell: ({getValue}) => (
          <Badge variant="secondary">
            <code>{getValue()}</code>
          </Badge>
        ),
      },
      actionsColumn(({row}) => [
        row.original.viewerCan?.moveUp && {
          key: 'move-up',
          label: RoleDirection.label(RoleDirection.UP),
          icon: ChevronUpIcon,
          disabled: isMoving,
          onClick: () =>
            moveRole({id: row.original.id, direction: RoleDirection.UP}),
        },
        row.original.viewerCan?.moveDown && {
          key: 'move-down',
          label: RoleDirection.label(RoleDirection.DOWN),
          icon: ChevronDownIcon,
          disabled: isMoving,
          onClick: () =>
            moveRole({id: row.original.id, direction: RoleDirection.DOWN}),
        },
        row.original.viewerCan?.addBelow && {
          key: 'add',
          label: 'Buraya ekle',
          icon: PlusIcon,
          onClick: () => openNear(row.original.id),
        },
        row.original.viewerCan?.update && {
          key: 'edit',
          label: 'Düzenle',
          icon: SquarePenIcon,
          onClick: () => open(row.original.id),
        },
        row.original.viewerCan?.delete && {
          key: 'delete',
          label: 'Sil',
          icon: Trash2Icon,
          variant: 'destructive',
          onClick: () => handleDelete(row.original),
        },
      ]),
    ];
  }, [deleteRole, moveRole, isMoving, open, openNear]);

  return (
    <TableProvider
      list={list}
      query={rolesQuery}
      columns={columns}
      flashedId={rowFlash.flashedId}
    >
      <PageHeader title="Roller" />
      <TableToolbar>
        <TableSearchInput placeholder="Ad, Anahtar…" />
      </TableToolbar>
      <DataTable
        emptyAction={
          <Button onClick={() => formPanel.open()}>
            <PlusIcon data-icon="inline-start" />
            Ekle
          </Button>
        }
      />
      <TablePagination />
      <RoleFormPanel />
    </TableProvider>
  );
}
