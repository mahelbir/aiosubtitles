'use client';

import {Fragment, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {pick} from 'es-toolkit';
import {FieldSkeleton} from '@/components/form/field-skeleton';
import {Form} from '@/components/form/form';
import {FormField} from '@/components/form/form-field';
import {FormGrid} from '@/components/form/form-grid';
import {
  FormDialog,
  FormPanel,
  FormPanelContent,
  FormPanelContentSkeleton,
} from '@/components/form/form-panel';
import {SaveButton, SaveButtonSkeleton} from '@/components/form/save-button';
import {TextInput} from '@/components/form/text-input';
import {UnsavedChangesGuard} from '@/components/form/unsaved-changes-guard';
import {Button} from '@/components/ui/button';
import {QueryBoundary} from '@/components/common/query-boundary';
import {TabMenuCard, TabMenuPanelSkeleton} from '@/components/common/tab-menu';
import {useIsOnline} from '@/hooks/use-is-online';
import {useTabQuery} from '@/hooks/use-tab-query';
import {useAppForm} from '@/lib/form';
import {useFixturePerson} from '../api';
import {useLatency} from '../hooks/use-latency';
import {FIXTURE_PEOPLE} from '../lib/fake-people';
import {FixtureSection} from './fixture-section';
import {FixtureState} from './fixture-state';

const EDIT_ACTION = 'edit';
const QUICK_EDIT_ACTION = 'quick-edit';
const CLOSED_PANEL = {action: null, targetId: null};
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
      <TextInput label="Konum" />
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

const LEADING_FIELDS = {
  disabled: {Field: IdField, Skeleton: FieldSkeleton},
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
  const [panel, setPanel] = useState(CLOSED_PANEL);
  const closePanel = () => setPanel(CLOSED_PANEL);
  const personQuery = useFixturePerson({
    id: panel.targetId,
    latency: useLatency(),
  });
  const isOnline = useIsOnline();
  const body = (
    <PersonPanelBody
      id={panel.targetId}
      query={personQuery}
      onClose={closePanel}
    />
  );

  return (
    <>
      <FixtureSection title="Panel">
        <ul className="flex flex-col gap-2">
          {FIXTURE_PEOPLE.map(person => (
            <li key={person.id} className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setPanel({action: EDIT_ACTION, targetId: person.id})
                }
              >
                {person.name} düzenle
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setPanel({action: QUICK_EDIT_ACTION, targetId: person.id})
                }
              >
                {person.name} hızlı düzenle
              </Button>
            </li>
          ))}
        </ul>
      </FixtureSection>
      <FormPanel
        open={panel.action === EDIT_ACTION}
        onClose={closePanel}
        title="Kayıt Düzenle"
      >
        {body}
      </FormPanel>
      <FormDialog
        open={panel.action === QUICK_EDIT_ACTION}
        onClose={closePanel}
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

  if (!id) {
    return null;
  }

  return (
    <QueryBoundary
      query={query}
      className="px-4"
      pending={
        <FormPanelContentSkeleton>
          {leadingField && <leadingField.Skeleton />}
          <PersonFieldsSkeleton />
        </FormPanelContentSkeleton>
      }
    >
      {person => (
        <PersonPanelForm key={person.id} person={person} onDone={onClose} />
      )}
    </QueryBoundary>
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

function TabForm({form, children}) {
  return (
    <Form form={form} className="flex-1 gap-0">
      <UnsavedChangesGuard />
      {children}
    </Form>
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

  return <TabForm form={form}>{children}</TabForm>;
}

function NotificationsWrapper({children}) {
  const form = useAppForm({defaultValues: {digestEmail: ''}});

  return <TabForm form={form}>{children}</TabForm>;
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
