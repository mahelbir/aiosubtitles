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
import {PageCardForm} from '@/components/form/page-card-form';
import {SaveButton} from '@/components/form/save-button';
import {TabMenuForm} from '@/components/form/tab-menu-form';
import {TextInput} from '@/components/form/text-input';
import {Button} from '@/components/ui/button';
import {TabMenuCard} from '@/components/common/tab-menu';
import {getListQueryKeys} from '@/hooks/use-list-query';
import {PanelAction, usePanelQuery} from '@/hooks/use-panel-query';
import {useTabQuery} from '@/hooks/use-tab-query';
import {useAppForm} from '@/lib/form';
import {optionSource} from '@/lib/option-source';
import {useFormStatus} from '../hooks/use-form-status';
import {FIXTURE_PEOPLE, findFixturePerson} from '../lib/fake-people';
import {FixtureSection} from './fixture-section';
import {FixtureState} from './fixture-state';

const INVITE_ACTION = 'invite';
const PANEL_ACTIONS = [PanelAction.CREATE, PanelAction.EDIT, INVITE_ACTION];

const TAB_RESET_KEYS = getListQueryKeys({
  status: {source: optionSource.fixed([{value: 'active', label: 'Aktif'}])},
});

const TAB_ITEMS = [
  {
    value: 'genel',
    label: 'Genel',
    Wrapper: GeneralTabForm,
    Fields: GeneralTabFields,
  },
  {
    value: 'bildirim',
    label: 'Bildirimler',
    Wrapper: NotificationsTabForm,
    Fields: NotificationsTabFields,
  },
  {value: 'guvenlik', label: 'Güvenlik'},
];

const MANY_TAB_ITEMS = [
  ...TAB_ITEMS,
  ...range(1, 21).map(order => ({
    value: `ek-${order}`,
    label: `Ek sekme ${order}`,
  })),
];

const TabSubmitContext = createContext(null);

const recordFormSchema = z.object({name: z.string().min(1, 'Ad gerekli')});
const inviteFormSchema = z.object({
  email: z.email('Geçerli bir e-posta girin'),
});
const addressFormSchema = z.object({city: z.string()});

export function FormShellsFixture() {
  const searchParams = useSearchParams();
  const formPanel = usePanelQuery({actions: PANEL_ACTIONS});
  const tabItems = searchParams.has('hasManyTabs') ? MANY_TAB_ITEMS : TAB_ITEMS;
  const [activeTab, setActiveTab] = useTabQuery(tabItems, {
    resetKeys: TAB_RESET_KEYS,
  });
  const [submitted, setSubmitted] = useState({});
  const isRecordPanelOpen =
    formPanel.isOpen && formPanel.action !== INVITE_ACTION;

  const submit = shell => values =>
    setSubmitted(current => ({...current, [shell]: values}));

  const profileForm = useAppForm({
    schema: recordFormSchema,
    defaultValues: {name: 'Ada Yılmaz'},
    onSubmit: ({value}) => submit('profile')(value),
  });
  const addressForm = useAppForm({
    schema: addressFormSchema,
    defaultValues: {city: ''},
    onSubmit: ({value}) => submit('address')(value),
  });
  const profileStatus = useFormStatus(profileForm);
  const addressStatus = useFormStatus(addressForm);

  return (
    <>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => formPanel.openNear(person.id)}
              >
                {person.name} altına ekle
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
          formPanel.action === PanelAction.EDIT ? 'Kayıt Düzenle' : 'Kayıt Ekle'
        }
      >
        <RecordForm
          key={`${formPanel.action}:${formPanel.targetId ?? formPanel.anchorId ?? 'new'}`}
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
      <TabSubmitContext value={submit}>
        <TabMenuCard
          items={tabItems}
          value={activeTab}
          onValueChange={setActiveTab}
          footer={tab => tab.Wrapper && <SaveButton />}
          className="md:min-h-96"
        >
          {tab => (
            <>
              <p>{tab.label} sekmesinin içeriği.</p>
              {tab.Fields && <tab.Fields />}
            </>
          )}
        </TabMenuCard>
      </TabSubmitContext>
      <section aria-label="Profil">
        <PageCardForm
          form={profileForm}
          title="Profil kartı"
          back="/admin/fixtures"
        >
          <FormField name="name">
            <TextInput label="Ad" />
          </FormField>
        </PageCardForm>
      </section>
      <section aria-label="Adres">
        <PageCardForm form={addressForm} title="Adres kartı">
          <FormField name="city">
            <TextInput label="Şehir" />
          </FormField>
        </PageCardForm>
      </section>
      <FixtureState
        value={{
          panel: {
            action: formPanel.action,
            isOpen: formPanel.isOpen,
            targetId: formPanel.targetId,
            anchorId: formPanel.anchorId,
          },
          tab: activeTab,
          cards: {profile: profileStatus, address: addressStatus},
          submitted,
        }}
      />
    </>
  );
}

function GeneralTabForm({children}) {
  const submit = use(TabSubmitContext);
  const form = useAppForm({
    defaultValues: {displayName: ''},
    onSubmit: ({value}) => submit('genel')(value),
  });

  return <TabMenuForm form={form}>{children}</TabMenuForm>;
}

function GeneralTabFields() {
  return (
    <FormField name="displayName">
      <TextInput label="Görünen ad" />
    </FormField>
  );
}

function NotificationsTabForm({children}) {
  const submit = use(TabSubmitContext);
  const form = useAppForm({
    defaultValues: {digestEmail: ''},
    onSubmit: ({value}) => submit('bildirim')(value),
  });

  return (
    <TabMenuForm form={form} aria-label="Bildirim ayarları" autoComplete="off">
      {children}
    </TabMenuForm>
  );
}

function NotificationsTabFields() {
  return (
    <FormField name="digestEmail">
      <TextInput label="Bildirim e-postası" type="email" />
    </FormField>
  );
}

function RecordForm({onSubmit}) {
  const formPanel = usePanelQuery({actions: PANEL_ACTIONS});
  const anchor = findFixturePerson(formPanel.anchorId);
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
      {anchor && <p>Konum: {anchor.name} altı</p>}
      <FormField name="name">
        <TextInput label="Ad" />
      </FormField>
      <div className="flex flex-wrap gap-2">
        {formPanel.action === PanelAction.EDIT && (
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
  const formPanel = usePanelQuery({actions: PANEL_ACTIONS});
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
