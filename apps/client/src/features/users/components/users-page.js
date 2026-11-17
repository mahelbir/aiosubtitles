'use client';

import {useMemo} from 'react';
import {orderBy} from 'es-toolkit';
import {PlusIcon, SquarePenIcon, Trash2Icon} from 'lucide-react';
import {parseAsArrayOf, parseAsString} from 'nuqs';
import {toast} from 'react-toastify';
import {USER_SORT_FIELDS} from '@repo/shared/schemas/user.js';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {ToolbarButton} from '@/components/ui/toolbar';
import {BadgeList} from '@/components/common/badge-list';
import {DateTime} from '@/components/common/date-time';
import {
  InfoPopover,
  InfoPopoverContent,
  InfoPopoverTrigger,
} from '@/components/common/info-popover';
import {PageHeader} from '@/components/common/page-header';
import {actionsColumn} from '@/components/table/actions-column';
import {DataTable} from '@/components/table/data-table';
import {TableActionBar} from '@/components/table/table-action-bar';
import {TablePagination} from '@/components/table/table-pagination';
import {SelectableTableProvider} from '@/components/table/table-provider';
import {TableSearchInput} from '@/components/table/table-search';
import {TableToolbar} from '@/components/table/table-toolbar';
import {usePanelQuery} from '@/hooks/use-panel-query';
import {useListQuery} from '@/hooks/use-list-query';
import {roleOptionSource, toRoleOption} from '@/api/role-options';
import {appAlert} from '@/lib/app-alert';
import {BulkError} from '@/lib/bulk';
import {optionSource} from '@/lib/option-source';
import {useDeleteUser, useDeleteUsers, useUsers} from '../api';
import {UserFormPanel} from './user-form-panel';

const ROLE_PARSER = parseAsArrayOf(parseAsString);

const USER_FILTERS = {
  roleId: {title: 'Rol', source: roleOptionSource, parser: ROLE_PARSER},
  disabled: {
    title: 'Durum',
    source: optionSource.fixed([
      {value: false, label: 'Aktif'},
      {value: true, label: 'Pasif'},
    ]),
  },
};

function canDeleteRow(row) {
  return Boolean(row.original.viewerCan?.delete);
}

export function UsersPage() {
  const list = useListQuery({
    filters: USER_FILTERS,
    sortable: USER_SORT_FIELDS,
  });
  const usersQuery = useUsers(list.query);
  const formPanel = usePanelQuery();
  const {open} = formPanel;
  const deleteMutation = useDeleteUser({
    toast: false,
    onSuccess: () => toast.success('Kullanıcı silindi.'),
  });
  const bulkDeleteMutation = useDeleteUsers({
    toast: {
      pending: 'Kullanıcılar siliniyor…',
      success: 'Seçili kullanıcılar silindi.',
      error: {
        render: ({data}) =>
          data instanceof BulkError
            ? `${data.succeeded}/${data.succeeded + data.failed} kullanıcı silindi.`
            : data.message,
      },
    },
  });

  const deleteUser = deleteMutation.mutateAsync;
  const deleteUsers = bulkDeleteMutation.mutate;

  const columns = useMemo(() => {
    const handleDelete = user =>
      appAlert.confirmDangerous(`"${user.email}" kullanıcısı silinsin mi?`, {
        pending: 'Siliniyor…',
        onConfirm: () => deleteUser(user.id),
        error: ({cause}) => cause.message,
      });
    return [
      {
        accessorKey: 'email',
        header: 'E-posta',
        enableSorting: false,
      },
      {
        accessorKey: 'roles',
        header: 'Roller',
        enableSorting: false,
        cell: ({getValue}) => (
          <BadgeList
            items={orderBy(getValue() ?? [], ['position'], ['desc']).map(
              toRoleOption,
            )}
          />
        ),
      },
      {
        accessorKey: 'disabledAt',
        header: 'Durum',
        cell: ({getValue}) => {
          const disabledAt = getValue();
          if (!disabledAt) {
            return <Badge variant="success">Aktif</Badge>;
          }
          return (
            <InfoPopover>
              <InfoPopoverTrigger>
                <Badge variant="destructive">Pasif</Badge>
              </InfoPopoverTrigger>
              <InfoPopoverContent>
                <DateTime value={disabledAt} />
              </InfoPopoverContent>
            </InfoPopover>
          );
        },
      },
      actionsColumn(({row}) => [
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
  }, [deleteUser, open]);

  return (
    <SelectableTableProvider
      list={list}
      query={usersQuery}
      columns={columns}
      enableRowSelection={canDeleteRow}
    >
      <PageHeader title="Kullanıcılar">
        <Button onClick={() => formPanel.open()}>
          <PlusIcon data-icon="inline-start" />
          Ekle
        </Button>
      </PageHeader>
      <TableToolbar>
        <TableSearchInput placeholder="ID, E-posta…" />
      </TableToolbar>
      <DataTable />
      <TableActionBar>
        {({ids, clear}) => (
          <ToolbarButton
            variant="destructive"
            size="sm"
            onClick={async () => {
              if (
                await appAlert.confirmDangerous(
                  `${ids.length} kullanıcı silinsin mi?`,
                )
              ) {
                deleteUsers(ids, {onSuccess: clear});
              }
            }}
          >
            <Trash2Icon data-icon="inline-start" />
            Sil
          </ToolbarButton>
        )}
      </TableActionBar>
      <TablePagination />
      <UserFormPanel />
    </SelectableTableProvider>
  );
}
