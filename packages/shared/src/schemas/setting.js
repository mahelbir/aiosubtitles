import {compact, uniq} from 'es-toolkit';
import {z} from 'zod';
import {SubtitleSource} from '../constants/subtitle-source.js';
import {defineSettings} from '../lib/settings.js';

const sharedCredentialListField = z
  .array(z.string().trim())
  .overwrite(sharedSecrets => uniq(compact(sharedSecrets)))
  .default([]);

export const settingsDefinition = defineSettings({
  editableFields: {},
  serverFields: {
    sharedCredentials: z
      .object(
        Object.fromEntries(
          SubtitleSource.values
            .filter(
              subtitleSource =>
                SubtitleSource.raw(subtitleSource).sharedCredentialKind,
            )
            .map(subtitleSource => [subtitleSource, sharedCredentialListField]),
        ),
      )
      .prefault({}),
  },
  rules: [],
});
