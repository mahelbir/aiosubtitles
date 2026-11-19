'use client';

import {createContext, use, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {range} from 'es-toolkit';
import {PlusIcon, SendIcon} from 'lucide-react';
import {z} from 'zod';
import {
  FormDialog,
  FormPanel,
  FormPanelContent,
} from '@/components/form/form-panel';
import {FormField} from '@/components/form/form-field';
import {TextInput} from '@/components/form/text-input';
import {Button} from '@/components/ui/button';
import {TabMenuCard} from '@/components/common/tab-menu';
import {useTabQuery} from '@/hooks/use-tab-query';
import {useAppForm} from '@/lib/form';
import {FIXTURE_PEOPLE, findFixturePerson} from '../lib/fake-people';
import {FixtureSection} from './fixture-section';
import {FixtureState} from './fixture-state';

const CREATE_ACTION = 'create';
const EDIT_ACTION = 'edit';
const INVITE_ACTION = 'invite';
const PANEL_ACTIONS = [CREATE_ACTION, EDIT_ACTION, INVITE_ACTION];
const CLOSED_PANEL = {action: null, targetId: null};

const TAB_RESET_KEYS = ['pageNumber', 'search', 'sort', 'status'];

const TAB_ITEMS = [
  {value: 'genel', label: 'Genel'},
  {value: 'bildirim', label: 'Bildirimler'},
  {value: 'guvenlik', label: 'Güvenlik', marker: '*'},
];

const MANY_TAB_ITEMS = [
  ...TAB_ITEMS,
  ...range(1, 21).map(order => ({
    value: `ek-${order}`,
    label: `Ek sekme ${order}`,
  })),
];

const PanelContext = createContext(null);

const recordFormSchema = z.object({name: z.string().min(1, 'Ad gerekli')});
const inviteFormSchema = z.object({
  email: z.email('Geçerli bir e-posta girin'),
});

export function FormShellsFixture() {
  const searchParams = useSearchParams();
  const formPanel = useFixturePanel(searchParams);
  const tabItems = searchParams.has('hasManyTabs') ? MANY_TAB_ITEMS : TAB_ITEMS;
  const [activeTab, setActiveTab] = useTabQuery(tabItems, {
    resetKeys: TAB_RESET_KEYS,
  });
  const [submitted, setSubmitted] = useState({});
  const isRecordPanelOpen =
    formPanel.isOpen && formPanel.action !== INVITE_ACTION;

  const submit = shell => values =>
    setSubmitted(current => ({...current, [shell]: values}));

  return (
    <PanelContext value={formPanel}>
      <FixtureSection title="Kayıtlar">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => formPanel.open()}>
            <PlusIcon data-icon="inline-start" />
            Ekle
          </Button>
          <Button
            variant="outline"
            onClick={() => formPanel.openAction(INVITE_ACTION)}
          >
            <SendIcon data-icon="inline-start" />
            Davet et
          </Button>
        </div>
        <ul className="flex flex-col gap-2">
          {FIXTURE_PEOPLE.map(person => (
            <li key={person.id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-32">{person.name}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => formPanel.open(person.id)}
              >
                {person.name} düzenle
              </Button>
            </li>
          ))}
        </ul>
      </FixtureSection>
      <FormPanel
        open={isRecordPanelOpen}
        onClose={formPanel.close}
        size={searchParams.get('panelSize') ?? undefined}
        title={
          formPanel.action === EDIT_ACTION ? 'Kayıt Düzenle' : 'Kayıt Ekle'
        }
      >
        <RecordForm
          key={`${formPanel.action}:${formPanel.targetId ?? 'new'}`}
          onSubmit={submit('panel')}
        />
      </FormPanel>
      <FormDialog
        open={formPanel.action === INVITE_ACTION}
        onClose={formPanel.close}
        title="Davet Et"
        size={searchParams.get('dialogSize') ?? undefined}
      >
        <InviteForm onSubmit={submit('dialog')} />
      </FormDialog>
      <TabMenuCard
        items={tabItems}
        value={activeTab}
        onValueChange={setActiveTab}
        className="md:min-h-96"
      >
        {tab => <p>{tab.label} sekmesinin içeriği.</p>}
      </TabMenuCard>
      <FixtureState
        value={{
          panel: {
            action: formPanel.action,
            isOpen: formPanel.isOpen,
            targetId: formPanel.targetId,
          },
          tab: activeTab,
          submitted,
        }}
      />
    </PanelContext>
  );
}

function useFixturePanel(searchParams) {
  const [panel, setPanel] = useState(() => readPanel(searchParams));
  return {
    ...panel,
    isOpen: panel.action !== null,
    open: targetId =>
      setPanel(
        targetId === undefined
          ? {action: CREATE_ACTION, targetId: null}
          : {action: EDIT_ACTION, targetId: String(targetId)},
      ),
    openAction: action => setPanel({action, targetId: null}),
    close: () => setPanel(CLOSED_PANEL),
  };
}

function readPanel(searchParams) {
  const action = searchParams.get('action');
  if (!PANEL_ACTIONS.includes(action)) {
    return CLOSED_PANEL;
  }
  return {
    action,
    targetId: action === EDIT_ACTION ? searchParams.get('id') : null,
  };
}

function RecordForm({onSubmit}) {
  const formPanel = use(PanelContext);
  const form = useAppForm({
    schema: recordFormSchema,
    defaultValues: {name: findFixturePerson(formPanel.targetId)?.name ?? ''},
    onSubmit: ({value}) => {
      onSubmit(value);
      formPanel.close();
    },
  });

  return (
    <FormPanelContent form={form} onCancel={formPanel.close}>
      {formPanel.targetId && <p>Kayıt no: {formPanel.targetId}</p>}
      <FormField name="name">
        <TextInput label="Ad" />
      </FormField>
      <div className="flex flex-wrap gap-2">
        {formPanel.action === EDIT_ACTION && (
          <Button type="button" variant="link" onClick={() => formPanel.open()}>
            Yeni kayıt
          </Button>
        )}
        <Button
          type="button"
          variant="link"
          onClick={() => formPanel.openAction(INVITE_ACTION)}
        >
          Bunun yerine davet et
        </Button>
      </div>
    </FormPanelContent>
  );
}

function InviteForm({onSubmit}) {
  const formPanel = use(PanelContext);
  const form = useAppForm({
    schema: inviteFormSchema,
    defaultValues: {email: ''},
    onSubmit: ({value}) => {
      onSubmit(value);
      formPanel.close();
    },
  });

  return (
    <FormPanelContent form={form} onCancel={formPanel.close}>
      <FormField name="email">
        <TextInput label="E-posta" type="email" />
      </FormField>
    </FormPanelContent>
  );
}
