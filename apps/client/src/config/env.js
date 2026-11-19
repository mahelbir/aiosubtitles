import {z} from 'zod';
import {deepFreeze} from 'melperjs';
import {baseUrlField} from '@repo/shared/schemas/common.js';

const envSchema = z.object({
  API_URL: baseUrlField.or(z.literal('')),
  LOCALE: z.string().optional(),
});

export const env = deepFreeze(
  envSchema.parse({
    API_URL: process.env.NEXT_PUBLIC_API_URL,
    LOCALE: process.env.LOCALE,
  }),
);
