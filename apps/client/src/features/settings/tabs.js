import {mapValues, pick} from 'es-toolkit';
import {z} from 'zod';
import {settingsDefinition} from '@repo/shared/schemas/setting.js';
import {generalTab} from './components/tabs/general-tab.js';

const TABS = [generalTab];

export const SETTINGS_TABS = TABS.map(tab => {
  const keys = Object.keys(tab.fields);
  const schema =
    tab.schema ??
    settingsDefinition.editableSchema.pick(
      Object.fromEntries(keys.map(key => [key, true])),
    );
  return {
    ...tab,
    schema,
    formKeys: Object.keys(schema.shape),
    isAdapted: Boolean(tab.toForm || tab.toSettings),
    toForm: tab.toForm ?? (settings => pick(settings, keys)),
    toSettings: tab.toSettings ?? (values => pick(values, keys)),
  };
});

const SETTINGS_RULE_KEYS = SETTINGS_TABS.filter(tab => !tab.isAdapted).flatMap(
  tab => Object.keys(tab.fields),
);

export const SETTINGS_FORM_SCHEMA = z
  .object(Object.assign({}, ...SETTINGS_TABS.map(tab => tab.schema.shape)))
  .check(
    ...settingsDefinition.getChecksWithin(SETTINGS_RULE_KEYS),
    ...SETTINGS_TABS.flatMap(tab => tab.checks ?? []),
  );

const SETTINGS_FIELDS = Object.assign(
  {},
  ...SETTINGS_TABS.map(tab =>
    mapValues(tab.fields, field => ({...field, tab: tab.title})),
  ),
);

export function getSettingLabel(path) {
  const [key, ...segments] = path.split('.');
  let field = SETTINGS_FIELDS[key];
  if (!field) {
    return path;
  }
  const labels = [field.tab, field.label];
  for (const segment of segments) {
    field = field.fields?.[segment];
    if (!field) {
      break;
    }
    labels.push(field.label);
  }
  return labels.join(' › ');
}

export function toFormValues(settings) {
  return Object.assign({}, ...SETTINGS_TABS.map(tab => tab.toForm(settings)));
}

export function toSettingsValues(values) {
  return Object.assign({}, ...SETTINGS_TABS.map(tab => tab.toSettings(values)));
}
