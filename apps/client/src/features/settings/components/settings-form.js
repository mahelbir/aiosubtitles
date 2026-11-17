'use client';

import {useEffect, useRef} from 'react';
import {useSelector} from '@tanstack/react-form';
import {cloneDeep, flattenObject, isEqual, pick, pickBy} from 'es-toolkit';
import {get, set} from 'es-toolkit/compat';
import {toast} from 'react-toastify';
import {settingsDefinition} from '@repo/shared/schemas/setting.js';
import {Form} from '@/components/form/form.js';
import {FormGrid} from '@/components/form/form-grid';
import {SaveButton} from '@/components/form/save-button.js';
import {UnsavedChangesGuard} from '@/components/form/unsaved-changes-guard';
import {TabMenuCard} from '@/components/common/tab-menu';
import {useTabQuery} from '@/hooks/use-tab-query';
import {appAlert} from '@/lib/app-alert';
import {
  getChangedValues,
  isFieldDirty,
  isWithinField,
  useAppForm,
} from '@/lib/form.js';
import {metaError} from '@/lib/form-context.js';
import {useRefreshSettings, useUpdateSettings} from '../api.js';
import {
  SETTINGS_FORM_SCHEMA,
  SETTINGS_TABS,
  getSettingLabel,
  toFormValues,
  toSettingsValues,
} from '../tabs.js';

const ERROR_DISPLAY = 'onChange';

const TAB_ITEMS = SETTINGS_TABS.map(tab => ({
  value: tab.key,
  label: tab.title,
  Icon: tab.Icon,
  Panel: tab.Panel,
}));

function getLeafPaths(values) {
  return Object.keys(flattenObject(values, {preserveArrays: true}));
}

function erroredTabKeys(state) {
  const erroredNames = Object.keys(
    pickBy(state.fieldMeta, meta =>
      metaError(meta, state.submissionAttempts, ERROR_DISPLAY),
    ),
  );
  return SETTINGS_TABS.filter(tab =>
    tab.formKeys.some(key =>
      erroredNames.some(name => isWithinField(name, key)),
    ),
  ).map(tab => tab.key);
}

function confirmOverwrite(paths) {
  return appAlert.confirmDangerous(
    'Aşağıdaki ayarlar arka planda değiştirilmiş.',
    {
      description: paths.map(path => (
        <span key={path} className="block text-start">
          • {getSettingLabel(path)}
        </span>
      )),
      confirmButtonText: 'Üzerine Yaz',
    },
  );
}

export function SettingsForm({settings}) {
  const [activeTab, setActiveTab] = useTabQuery(TAB_ITEMS);
  const baselineRef = useRef(null);
  const refreshSettings = useRefreshSettings();
  const updateMutation = useUpdateSettings();

  const form = useAppForm({
    defaultValues: toFormValues(settings),
    schema: SETTINGS_FORM_SCHEMA,
    errorDisplay: ERROR_DISPLAY,
    mutation: {
      mutateAsync: async values => {
        const baseline = baselineRef.current;
        const changed = getChangedValues(
          settingsDefinition.editableSchema.parse(toSettingsValues(values)),
          baseline,
        );
        if (Object.keys(changed).length === 0) {
          toast.info('Değişiklik yok.');
          return null;
        }
        const latest = await refreshSettings();
        const conflicts = getLeafPaths(changed).filter(
          path => !isEqual(get(latest, path), get(baseline, path)),
        );
        if (conflicts.length > 0 && !(await confirmOverwrite(conflicts))) {
          return null;
        }
        const {data: saved} = await updateMutation.mutateAsync(changed);
        form.reset(toFormValues(saved));
        baselineRef.current = saved;
        return null;
      },
    },
  });

  const erroredKeys = useSelector(form.store, erroredTabKeys, {
    compare: isEqual,
  });

  useEffect(() => {
    if (!baselineRef.current) {
      baselineRef.current = cloneDeep(settings);
      return;
    }
    const isDirty = name => isFieldDirty(form, name);
    const baseline = cloneDeep(baselineRef.current);
    for (const tab of SETTINGS_TABS) {
      const nextValues = tab.toForm(settings);
      if (tab.isAdapted && Object.keys(nextValues).some(isDirty)) {
        continue;
      }
      for (const path of getLeafPaths(nextValues)) {
        const value = get(nextValues, path);
        if (!isDirty(path) && !isEqual(form.getFieldValue(path), value)) {
          form.setFieldValue(path, value, {dontUpdateMeta: true});
        }
      }
      const owned = pick(settings, Object.keys(tab.fields));
      for (const path of getLeafPaths(owned)) {
        if (tab.isAdapted || !isDirty(path)) {
          set(baseline, path, get(settings, path));
        }
      }
    }
    baselineRef.current = baseline;
  }, [settings, form]);

  return (
    <Form form={form}>
      <UnsavedChangesGuard />
      <TabMenuCard
        items={TAB_ITEMS}
        value={activeTab}
        onValueChange={setActiveTab}
        invalidValues={erroredKeys}
        footer={<SaveButton />}
        className="md:min-h-84"
      >
        {tab => (
          <FormGrid>
            <tab.Panel />
          </FormGrid>
        )}
      </TabMenuCard>
    </Form>
  );
}
