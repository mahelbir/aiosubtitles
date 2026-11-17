'use client';

import {Fragment} from 'react';
import {useSearchParams} from 'next/navigation';
import {pick} from 'es-toolkit';
import {RolePlacement} from '@repo/shared/constants/role.js';
import {CheckboxInput} from '@/components/form/checkbox-input';
import {
  CheckboxFieldSkeleton,
  FieldSkeleton,
} from '@/components/form/field-skeleton';
import {FormField} from '@/components/form/form-field';
import {FormGrid} from '@/components/form/form-grid';
import {
  FormDialog,
  FormPanel,
  FormPanelContent,
  FormPanelContentSkeleton,
} from '@/components/form/form-panel';
import {
  PageCardForm,
  PageCardFormSkeleton,
} from '@/components/form/page-card-form';
import {SaveButton, SaveButtonSkeleton} from '@/components/form/save-button';
import {TabMenuForm} from '@/components/form/tab-menu-form';
import {TextInput} from '@/components/form/text-input';
import {ToggleGroupInput} from '@/components/form/toggle-group-input';
import {Button} from '@/components/ui/button';
import {PanelEntityBoundary} from '@/components/common/entity-boundary';
import {QueryBoundary} from '@/components/common/query-boundary';
import {TabMenuCard, TabMenuPanelSkeleton} from '@/components/common/tab-menu';
import {useIsOnline} from '@/hooks/use-is-online';
import {PanelAction, usePanelQuery} from '@/hooks/use-panel-query';
import {useTabQuery} from '@/hooks/use-tab-query';
import {useAppForm} from '@/lib/form';
import {useFixturePerson} from '../api';
import {useLatency} from '../hooks/use-latency';
import {FIXTURE_PEOPLE} from '../lib/fake-people';
import {FixtureSection} from './fixture-section';
import {FixtureState} from './fixture-state';

const QUICK_EDIT_ACTION = 'quick-edit';
const PANEL_ACTIONS = [PanelAction.EDIT, QUICK_EDIT_ACTION];
const CARD_PROPS = {title: 'Profil kartı', back: '/admin/fixtures'};
const GENERAL_TAB_LABEL = 'Genel';
const LATE_PERSON_ID = '2';
const LATE_FIELD_MS = 400;

function useProfile() {
  return useFixturePerson({id: '3', latency: useLatency()});
}

function usePersonForm(person) {
  return useAppForm({defaultValues: pick(person, ['id', 'name', 'email'])});
}

function PlacementField() {
  return (
    <FormField name="placement">
      <ToggleGroupInput label="Konum" options={RolePlacement.toList()} />
    </FormField>
  );
}

function IdField() {
  return (
    <FormField name="id">
      <TextInput label="Kimlik" disabled />
    </FormField>
  );
}

function ActiveField() {
  return (
    <FormField name="isActive">
      <CheckboxInput label="Aktif" />
    </FormField>
  );
}

const LEADING_FIELDS = {
  group: {Field: PlacementField, Skeleton: FieldSkeleton},
  disabled: {Field: IdField, Skeleton: FieldSkeleton},
  checkbox: {Field: ActiveField, Skeleton: CheckboxFieldSkeleton},
  unmatched: {Field: PlacementField, Skeleton: Fragment},
};

function useLead() {
  return useSearchParams().get('lead');
}

function PersonFields() {
  return (
    <>
      <FormField name="name">
        <TextInput label="Ad" />
      </FormField>
      <FormField name="email">
        <TextInput label="E-posta" type="email" />
      </FormField>
    </>
  );
}

function PersonFieldsSkeleton() {
  return (
    <>
      <FieldSkeleton />
      <FieldSkeleton />
    </>
  );
}

export function FormSkeletonsFixture() {
  const formPanel = usePanelQuery({actions: PANEL_ACTIONS});
  const personQuery = useFixturePerson({
    id: formPanel.targetId,
    latency: useLatency(),
  });
  const isOnline = useIsOnline();
  const body = (
    <PersonPanelBody
      id={formPanel.targetId}
      query={personQuery}
      onClose={formPanel.close}
    />
  );

  return (
    <>
      <ProfileCard />
      <FixtureSection title="Panel">
        <ul className="flex flex-col gap-2">
          {FIXTURE_PEOPLE.map(person => (
            <li key={person.id} className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => formPanel.open(person.id)}
              >
                {person.name} düzenle
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  formPanel.openAction(QUICK_EDIT_ACTION, person.id)
                }
              >
                {person.name} hızlı düzenle
              </Button>
            </li>
          ))}
        </ul>
      </FixtureSection>
      <FormPanel
        open={formPanel.action === PanelAction.EDIT}
        onClose={formPanel.close}
        title="Kayıt Düzenle"
      >
        {body}
      </FormPanel>
      <FormDialog
        open={formPanel.action === QUICK_EDIT_ACTION}
        onClose={formPanel.close}
        title="Hızlı Düzenle"
      >
        {body}
      </FormDialog>
      <ProfileTabs />
      <FixtureState
        value={{
          isOnline,
          panel: {
            status: personQuery.status,
            fetchStatus: personQuery.fetchStatus,
          },
        }}
      />
    </>
  );
}

function PersonPanelBody({id, query, onClose}) {
  const leadingField = LEADING_FIELDS[useLead()];

  return (
    <PanelEntityBoundary
      id={id}
      query={query}
      onClose={onClose}
      className="px-4"
      pending={
        <FormPanelContentSkeleton>
          {leadingField && <leadingField.Skeleton />}
          <PersonFieldsSkeleton />
        </FormPanelContentSkeleton>
      }
    >
      {person =>
        person && (
          <PersonPanelForm key={person.id} person={person} onDone={onClose} />
        )
      }
    </PanelEntityBoundary>
  );
}

function PersonPanelForm({person, onDone}) {
  const leadingField = LEADING_FIELDS[useLead()];
  const lateQuery = useFixturePerson({
    id: useSearchParams().has('late') ? LATE_PERSON_ID : null,
    latency: LATE_FIELD_MS,
  });
  const form = usePersonForm(person);

  return (
    <FormPanelContent form={form} onCancel={onDone}>
      {leadingField && <leadingField.Field />}
      {lateQuery.data && <PlacementField />}
      <PersonFields />
    </FormPanelContent>
  );
}

function ProfileCard() {
  const profileQuery = useProfile();

  return (
    <section aria-label="Kart">
      <QueryBoundary
        query={profileQuery}
        pending={
          <PageCardFormSkeleton {...CARD_PROPS}>
            <PersonFieldsSkeleton />
          </PageCardFormSkeleton>
        }
      >
        {profile => <ProfileCardForm profile={profile} />}
      </QueryBoundary>
    </section>
  );
}

function ProfileCardForm({profile}) {
  const form = usePersonForm(profile);

  return (
    <PageCardForm form={form} {...CARD_PROPS}>
      <PersonFields />
    </PageCardForm>
  );
}

function GeneralWrapper({children}) {
  const profileQuery = useProfile();

  return (
    <QueryBoundary
      query={profileQuery}
      pending={
        <TabMenuPanelSkeleton
          label={GENERAL_TAB_LABEL}
          actions={<SaveButtonSkeleton />}
        >
          <FormGrid>
            <PersonFieldsSkeleton />
          </FormGrid>
        </TabMenuPanelSkeleton>
      }
    >
      {profile => (
        <GeneralFormProvider profile={profile}>{children}</GeneralFormProvider>
      )}
    </QueryBoundary>
  );
}

function GeneralFormProvider({profile, children}) {
  const form = usePersonForm(profile);

  return <TabMenuForm form={form}>{children}</TabMenuForm>;
}

function NotificationsWrapper({children}) {
  const form = useAppForm({defaultValues: {digestEmail: ''}});

  return <TabMenuForm form={form}>{children}</TabMenuForm>;
}

function NotificationsPanel() {
  return (
    <FormField name="digestEmail">
      <TextInput label="Bildirim e-postası" type="email" />
    </FormField>
  );
}

const PROFILE_TABS = [
  {
    value: 'genel',
    label: GENERAL_TAB_LABEL,
    Wrapper: GeneralWrapper,
    Panel: PersonFields,
  },
  {
    value: 'bildirim',
    label: 'Bildirimler',
    Wrapper: NotificationsWrapper,
    Panel: NotificationsPanel,
  },
];

function ProfileTabs() {
  const [activeTab, setActiveTab] = useTabQuery(PROFILE_TABS);

  return (
    <section aria-label="Sekmeler">
      <TabMenuCard
        items={PROFILE_TABS}
        value={activeTab}
        onValueChange={setActiveTab}
        footer={<SaveButton />}
      >
        {tab => (
          <FormGrid>
            <tab.Panel />
          </FormGrid>
        )}
      </TabMenuCard>
    </section>
  );
}
