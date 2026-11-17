import {z} from 'zod';
import en from 'zod/v4/locales/en.js';
import tr from 'zod/v4/locales/tr.js';

const LOCALES = {en, tr};

export function configureZodLocale(locale) {
  const resolve = LOCALES[locale];
  if (!resolve) {
    throw new Error(
      `Unsupported locale: ${locale}. Supported: ${Object.keys(LOCALES).join(', ')}`,
    );
  }
  z.config(resolve());
}
