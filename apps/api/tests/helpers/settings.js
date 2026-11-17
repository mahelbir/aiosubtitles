import {z} from 'zod';
import {defineSettings, getSettingsRule} from '@repo/shared/lib/settings.js';

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
      {message: 'Limit must be above zero when enabled', path: ['limit']},
    ),
    getSettingsRule(
      ['notice'],
      settings => !settings.notice.isShown || settings.notice.title !== '',
      {
        message: 'A shown announcement needs a title',
        path: ['notice', 'title'],
      },
    ),
  ],
});
