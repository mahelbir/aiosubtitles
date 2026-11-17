import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {z} from 'zod';
import {defineSettings, getSettingsRule} from '@repo/shared/lib/settings.js';
import {config} from '../../src/config/index.js';
import {
  createSettings,
  SETTINGS_FILE,
  settings,
} from '../../src/lib/settings.js';

export const FIXTURE_SETTINGS_FILE = path.join(
  config.privateStoragePath,
  'fixture-settings.json',
);

export const fixtureSettingsDefinition = defineSettings({
  editableFields: {
    label: z.string().trim().default(''),
    limit: z.coerce.number().int().nonnegative().default(0),
    isEnabled: z.union([z.boolean(), z.stringbool()]).default(false),
    notice: z
      .object({
        title: z.string().trim().default(''),
        isShown: z.union([z.boolean(), z.stringbool()]).default(false),
      })
      .prefault({}),
  },
  serverFields: {
    revision: z.coerce.number().int().nonnegative().default(0),
  },
  rules: [
    getSettingsRule(
      ['isEnabled', 'limit'],
      settings => !settings.isEnabled || settings.limit > 0,
      {message: 'Etkinken sınır sıfırdan büyük olmalıdır', path: ['limit']},
    ),
    getSettingsRule(
      ['notice'],
      settings => !settings.notice.isShown || settings.notice.title !== '',
      {
        message: 'Gösterilen duyurunun başlığı olmalıdır',
        path: ['notice', 'title'],
      },
    ),
  ],
});

export const fixtureSettings = createSettings(
  FIXTURE_SETTINGS_FILE,
  fixtureSettingsDefinition.schema,
);

const SETTINGS_FILES = new Map([
  [fixtureSettings, FIXTURE_SETTINGS_FILE],
  [settings, SETTINGS_FILE],
]);

export async function writeSettingsFile(values, target = fixtureSettings) {
  await fs.writeFile(SETTINGS_FILES.get(target), JSON.stringify(values));
}

export async function seedSettings(values, target = fixtureSettings) {
  await writeSettingsFile(values, target);
  await target.reload();
}
