import {z} from 'zod';
import {defineSettings, getSettingsRule} from '../lib/settings.js';

export const settingsDefinition = defineSettings({
  editableFields: {
    name: z.string().trim().default(''),
    job: z
      .object({
        count: z.coerce.number().int().nonnegative().default(0),
        isEnabled: z.union([z.boolean(), z.stringbool()]).default(false),
      })
      .prefault({}),
  },
  serverFields: {},
  rules: [
    getSettingsRule(
      ['job'],
      settings => !settings.job.isEnabled || settings.job.count > 0,
      {
        message: 'İş aktifken iş sayısı sıfırdan büyük olmalıdır',
        path: ['job', 'count'],
      },
    ),
  ],
});
