'use client';

import {useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {z} from 'zod';
import {CheckboxGroupInput} from '@/components/form/checkbox-group-input';
import {Form} from '@/components/form/form';
import {FormField} from '@/components/form/form-field';
import {FormGrid} from '@/components/form/form-grid';
import {SubmitButton} from '@/components/form/submit-button';
import {useAppForm} from '@/lib/form';
import {optionSource} from '@/lib/option-source';
import {
  fixtureUserOptionSources,
  getFixtureDepartmentOptionSource,
} from '../api';
import {useFieldStates} from '../hooks/use-field-states';
import {useLatency} from '../hooks/use-latency';
import {FixtureErrorBoundary} from './fixture-error-boundary';
import {FixtureState} from './fixture-state';

const PERMISSION_OPTIONS = [
  {
    value: 'users.read',
    label: 'Kullanıcıları görüntüle',
    group: 'Kullanıcılar',
  },
  {value: 'users.create', label: 'Kullanıcı ekle', group: 'Kullanıcılar'},
  {value: 'users.update', label: 'Kullanıcı düzenle', group: 'Kullanıcılar'},
  {
    value: 'users.delete',
    label: 'Kullanıcı sil',
    group: 'Kullanıcılar',
    disabled: true,
  },
  {value: 'roles.read', label: 'Rolleri görüntüle', group: 'Roller'},
  {value: 'roles.create', label: 'Rol ekle', group: 'Roller'},
  {value: 'roles.delete', label: 'Rol sil', group: 'Roller', disabled: true},
  {value: 'settings.read', label: 'Ayarları görüntüle', group: 'Ayarlar'},
  {value: 'settings.update', label: 'Ayarları düzenle', group: 'Ayarlar'},
  {value: 'settings.export', label: 'Ayarları dışa aktar', group: 'Ayarlar'},
  {value: 'settings.import', label: 'Ayarları içe aktar', group: 'Ayarlar'},
];

const CHANNEL_OPTIONS = [
  {value: 'email', label: 'E-posta'},
  {value: 'sms', label: 'SMS'},
  {value: 'push', label: 'Anlık bildirim'},
];

const PAGED_TOTAL = 45;

const permissionSource = optionSource.fixed(PERMISSION_OPTIONS);

const CHANNEL_SOURCES = {
  fixed: () => optionSource.fixed(CHANNEL_OPTIONS),
  preloaded: getFixtureDepartmentOptionSource,
  pages: fixtureUserOptionSources.preloadedPages,
};

const channelFormSchema = z.object({
  channels: z.array(z.string()).min(1, 'En az bir kanal seçin'),
});

export function CheckboxGroupInputFixture() {
  const searchParams = useSearchParams();
  const latency = useLatency();
  const [submitted, setSubmitted] = useState(null);
  const [channelSource] = useState(() =>
    CHANNEL_SOURCES[searchParams.get('source') ?? 'fixed']({
      source: searchParams.has('api') ? 'api' : 'memory',
      total: PAGED_TOTAL,
      latency,
    }),
  );
  const form = useAppForm({
    schema: channelFormSchema,
    defaultValues: {
      permissions: ['users.delete'],
      channels: searchParams.has('hasChannel') ? ['email'] : [],
    },
    onSubmit: ({value}) => setSubmitted(value),
  });
  const fields = useFieldStates(form);
  const access = {
    disabled: searchParams.has('isDisabled'),
    readOnly: searchParams.has('isReadOnly'),
  };

  return (
    <>
      <Form form={form} aria-label="İzin formu">
        <FormGrid>
          <FormField name="permissions">
            <CheckboxGroupInput
              label="İzinler"
              source={permissionSource}
              {...access}
            />
          </FormField>
          <FormField name="channels">
            <FixtureErrorBoundary>
              <CheckboxGroupInput
                label="Kanallar"
                source={channelSource}
                {...access}
              />
            </FixtureErrorBoundary>
          </FormField>
        </FormGrid>
        <SubmitButton className="self-start">Kaydet</SubmitButton>
      </Form>
      <FixtureState value={{fields, submitted}} />
    </>
  );
}
