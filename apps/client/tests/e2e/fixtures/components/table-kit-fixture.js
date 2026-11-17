'use client';

import {useEffect, useMemo, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {onlineManager} from '@tanstack/react-query';
import {HistoryIcon, PlusIcon, SquarePenIcon, Trash2Icon} from 'lucide-react';
import {parseAsArrayOf, parseAsInteger, parseAsString} from 'nuqs';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {ToolbarButton} from '@/components/ui/toolbar';
import {CalendarDate, DateTime} from '@/components/common/date-time';
import {actionsColumn} from '@/components/table/actions-column';
import {DataTable, StaticDataTable} from '@/components/table/data-table';
import {expanderColumn} from '@/components/table/expander-column';
import {TableActionBar} from '@/components/table/table-action-bar';
import {
  TableDateRangeFilter,
  TableDayRangeFilter,
} from '@/components/table/table-date-range-filter';
import {TablePagination} from '@/components/table/table-pagination';
import {SelectableTableProvider} from '@/components/table/table-provider';
import {
  TableSearch,
  TableSearchInput,
  TableSearchLabel,
} from '@/components/table/table-search';
import {TableToolbar} from '@/components/table/table-toolbar';
import {useIsOnline} from '@/hooks/use-is-online';
import {useListQuery} from '@/hooks/use-list-query';
import {optionSource} from '@/lib/option-source';
import {
  fixtureUserOptionSources,
  getFixtureDepartmentOptionSource,
  useFixtureDepartments,
  useFixtureUsers,
  useToggleFixtureUser,
} from '../api';
import {useLatency} from '../hooks/use-latency';
import {FAKE_USER_SORT_FIELDS} from '../lib/fake-users';
import {FixtureSection} from './fixture-section';
import {FixtureState} from './fixture-state';

const DISABLED_FILTER = {
  title: 'Durum',
  source: optionSource.fixed([
    {value: false, label: 'Aktif'},
    {value: true, label: 'Pasif'},
  ]),
};

const DEPARTMENT_PARSER = parseAsArrayOf(parseAsString);

const OWNER_PARSER = parseAsArrayOf(parseAsInteger);

const OWNER_TOTAL = 30;

const CITIES = [
  {id: 1, name: 'Zonguldak', region: 'Bölge 10'},
  {id: 2, name: 'Çanakkale', region: 'Bölge 2'},
  {id: 3, name: 'İnegöl', region: 'Bölge 12'},
  {id: 4, name: 'Cizre', region: 'Bölge 1'},
  {id: 5, name: 'Isparta', region: 'Bölge 9'},
  {id: 6, name: 'Ağrı', region: 'Bölge 3'},
];

const CITY_COLUMNS = [
  {accessorKey: 'name', header: 'Şehir'},
  {accessorKey: 'region', header: 'Bölge'},
];

export function TableKitFixture() {
  const searchParams = useSearchParams();
  const total = Number(searchParams.get('total') ?? 96);
  const latency = useLatency();
  const hasEmptyAction = searchParams.has('action');
  const isOnlyActiveSelectable = searchParams.get('selectable') === 'active';
  const userTable = (
    <UserTable
      key={total}
      source={searchParams.get('source')}
      departmentSource={searchParams.get('options')}
      total={total}
      latency={latency}
      hasEmptyAction={hasEmptyAction}
      isOnlyActiveSelectable={isOnlyActiveSelectable}
      inactiveRowVariant={searchParams.get('rowVariant') ?? 'subtle'}
    />
  );

  return (
    <>
      {searchParams.get('state') === 'offline' ? (
        <OfflineScenario>{userTable}</OfflineScenario>
      ) : (
        userTable
      )}
      <CityTable />
    </>
  );
}

function OfflineScenario({children}) {
  const isOnline = useIsOnline();

  useEffect(() => {
    onlineManager.setOnline(false);
    return () => onlineManager.setOnline(navigator.onLine);
  }, []);

  return isOnline ? null : children;
}

function isActiveRow(row) {
  return !row.original.disabledAt;
}

function UserTable({
  source,
  departmentSource,
  total,
  latency,
  hasEmptyAction,
  isOnlyActiveSelectable,
  inactiveRowVariant,
}) {
  const [bulkIds, setBulkIds] = useState(null);
  const [rowAction, setRowAction] = useState(null);
  const [emptyActionCount, setEmptyActionCount] = useState(0);
  const departmentScenario = {source: departmentSource, latency};
  const departmentsQuery = useFixtureDepartments(departmentScenario);

  const list = useListQuery({
    filters: {
      disabled: DISABLED_FILTER,
      department: {
        title: 'Departman',
        multiple: false,
        parser: DEPARTMENT_PARSER,
        source: getFixtureDepartmentOptionSource(departmentScenario),
      },
      owner: {
        title: 'Sahip',
        parser: OWNER_PARSER,
        source: fixtureUserOptionSources.remote({
          source: 'memory',
          total: OWNER_TOTAL,
          latency,
        }),
      },
      createdFrom: parseAsString,
      createdTo: parseAsString,
      seenFrom: parseAsString,
      seenTo: parseAsString,
    },
    sortable: FAKE_USER_SORT_FIELDS,
    defaultPageSize: 10,
  });
  const usersQuery = useFixtureUsers({
    source,
    total,
    query: list.query,
    latency,
  });
  const toggleMutation = useToggleFixtureUser();

  const columns = useMemo(
    () => [
      expanderColumn,
      {accessorKey: 'id', header: 'No'},
      {accessorKey: 'name', header: 'Ad'},
      {accessorKey: 'email', header: 'E-posta', enableSorting: false},
      {
        accessorKey: 'department',
        header: 'Departman',
        enableSorting: false,
        cell: ({getValue}) => getValue().label,
      },
      {
        accessorKey: 'disabledAt',
        header: 'Durum',
        enableSorting: false,
        cell: ({getValue}) =>
          getValue() ? (
            <Badge variant="destructive">Pasif</Badge>
          ) : (
            <Badge variant="success">Aktif</Badge>
          ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Kayıt tarihi',
        cell: ({getValue}) => <CalendarDate value={getValue()} />,
      },
      actionsColumn(({row}) => [
        {
          key: 'edit',
          label: 'Düzenle',
          icon: SquarePenIcon,
          onClick: () => setRowAction({key: 'edit', id: row.original.id}),
        },
        {
          key: 'history',
          label: 'Geçmiş',
          icon: HistoryIcon,
          href: `/fixtures/table-kit?history=${row.original.id}`,
        },
        !row.original.disabledAt && {
          key: 'delete',
          label: 'Sil',
          icon: Trash2Icon,
          variant: 'destructive',
          onClick: () => setRowAction({key: 'delete', id: row.original.id}),
        },
      ]),
    ],
    [],
  );

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => usersQuery.refetch()}>
          Yenile
        </Button>
        <Button variant="outline" onClick={() => departmentsQuery.refetch()}>
          Departmanları yeniden yükle
        </Button>
        <Button
          variant="outline"
          onClick={() => toggleMutation.mutate({total, id: 1})}
        >
          İlk kullanıcıyı değiştir
        </Button>
      </div>
      <FixtureSection title="Kullanıcılar">
        <SelectableTableProvider
          id="fixture-users"
          list={list}
          query={usersQuery}
          columns={columns}
          enableRowSelection={isOnlyActiveSelectable ? isActiveRow : undefined}
        >
          <TableToolbar>
            <TableSearch>
              <TableSearchLabel className="sr-only">
                Kullanıcı ara
              </TableSearchLabel>
              <TableSearchInput placeholder="No, Ad, E-posta…" />
            </TableSearch>
            <TableDateRangeFilter
              fromName="createdFrom"
              toName="createdTo"
              title="Kayıt tarihi"
            />
            <TableDayRangeFilter
              fromName="seenFrom"
              toName="seenTo"
              title="Son giriş"
            />
          </TableToolbar>
          <DataTable
            renderExpandedRow={row => <UserDetail user={row.original} />}
            getRowVariant={row =>
              isActiveRow(row) ? 'default' : inactiveRowVariant
            }
            emptyAction={
              hasEmptyAction ? (
                <Button onClick={() => setEmptyActionCount(count => count + 1)}>
                  <PlusIcon data-icon="inline-start" />
                  Kullanıcı ekle
                </Button>
              ) : null
            }
          />
          <TableActionBar>
            {({ids}) => (
              <ToolbarButton
                variant="outline"
                size="sm"
                onClick={() => setBulkIds(ids)}
              >
                Pasifleştir
              </ToolbarButton>
            )}
          </TableActionBar>
          <TablePagination />
        </SelectableTableProvider>
      </FixtureSection>
      <FixtureState
        value={{
          list: list.query,
          status: usersQuery.status,
          fetchStatus: usersQuery.fetchStatus,
          isPlaceholderData: usersQuery.isPlaceholderData,
          departments: {
            status: departmentsQuery.status,
            fetchStatus: departmentsQuery.fetchStatus,
          },
          bulkIds,
          rowAction,
          emptyActionCount,
        }}
      />
    </>
  );
}

function UserDetail({user}) {
  return (
    <div
      role="group"
      aria-label={`${user.name} ayrıntıları`}
      className="p-4 text-sm"
    >
      <dl className="grid gap-4 @md:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">E-posta</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Departman</dt>
          <dd>{user.department.label}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Son giriş</dt>
          <dd>
            <DateTime value={user.lastSeenAt} />
          </dd>
        </div>
      </dl>
    </div>
  );
}

function CityTable() {
  return (
    <FixtureSection title="Şehirler">
      <StaticDataTable columns={CITY_COLUMNS} data={CITIES} />
    </FixtureSection>
  );
}
