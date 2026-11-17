import {escapeRegExp, isPlainObject, trimEnd, uniq} from 'es-toolkit';
import {z} from 'zod';
import {URL_MAX_LENGTH} from '../constants/common.js';

const URL_INVALID_MESSAGE = 'URL geçersiz';

const URL_TOO_LONG_MESSAGE = `URL en fazla ${URL_MAX_LENGTH} karakter olabilir`;

export const jwtField = z
  .string('Token gereklidir')
  .min(1, 'Token boş olamaz')
  .refine(
    string => {
      const count = string.split('.').length;
      return count === 3 || count === 5;
    },
    {message: 'Geçersiz token'},
  );

export const portField = z.coerce
  .number('Bağlantı noktası gereklidir')
  .int('Bağlantı noktası tam sayı olmalıdır')
  .min(1, 'Bağlantı noktası 1 ile 65535 arasında olmalıdır')
  .max(65535, 'Bağlantı noktası 1 ile 65535 arasında olmalıdır');

export function getUuidField(message) {
  return z.uuid(message).toLowerCase();
}

const idField = getUuidField('Geçersiz ID');

export const uuidSchema = z.object({
  id: idField,
});

export function getIdListField({max}) {
  return z
    .array(idField, 'Seçim geçersiz')
    .min(1, 'En az bir kayıt seçilmelidir')
    .max(max, `En fazla ${max} kayıt seçilebilir`)
    .transform(ids => uniq(ids));
}

export function getSlugField({min, max}) {
  return z
    .string('Anahtar gereklidir')
    .min(min, `Anahtar en az ${min} karakter olmalıdır`)
    .max(max, `Anahtar en fazla ${max} karakter olabilir`)
    .regex(
      /^[a-z0-9-]+$/,
      'Anahtar yalnızca küçük harf, rakam ve - içerebilir',
    );
}

export function getIdentifierField(message) {
  return z.string(message).trim().toLowerCase();
}

export const emailField = getIdentifierField('E-posta gereklidir')
  .regex(z.regexes.email, 'Geçersiz e-posta')
  .meta({format: 'email'});

export const httpUrlField = z
  .httpUrl(URL_INVALID_MESSAGE)
  .max(URL_MAX_LENGTH, URL_TOO_LONG_MESSAGE)
  .meta({pattern: '^https?://'});

function hasNoIssues({issues}) {
  return issues.length === 0;
}

function getCaseInsensitivePattern(text) {
  return [...text]
    .map(char => {
      const lower = char.toLowerCase();
      const upper = char.toUpperCase();
      return lower === upper ? escapeRegExp(char) : `[${lower}${upper}]`;
    })
    .join('');
}

export function getBaseUrlField({protocols = ['http', 'https']} = {}) {
  const scheme = `(?:${protocols.map(getCaseInsensitivePattern).join('|')})`;
  const pattern = `^${scheme}://[^?#]*$`;
  return z
    .url({protocol: new RegExp(`^${scheme}$`), error: URL_INVALID_MESSAGE})
    .max(URL_MAX_LENGTH, {message: URL_TOO_LONG_MESSAGE, when: hasNoIssues})
    .regex(new RegExp(pattern), {
      message: URL_INVALID_MESSAGE,
      when: hasNoIssues,
    })
    .refine(
      url => {
        const {hostname, username, password} = new URL(url);
        return Boolean(hostname) && !username && !password;
      },
      {message: URL_INVALID_MESSAGE, when: hasNoIssues},
    )
    .overwrite(url => trimEnd(url, '/'))
    .meta({format: 'uri', pattern});
}

export const baseUrlField = getBaseUrlField();

export const isoDateField = z.iso.date('Tarih geçersiz');

export const isoDateTimeField = z.iso.datetime('Tarih geçersiz');

export function getCrossFieldCheck(keys, isSatisfied, params) {
  return z.refine(isSatisfied, {
    ...params,
    when: ({value, issues}) =>
      isPlainObject(value) &&
      !issues.some(issue => keys.includes(issue.path?.[0])),
  });
}

export function getDateRangeCheck(fromKey = 'from', toKey = 'to') {
  return getCrossFieldCheck(
    [fromKey, toKey],
    value =>
      !value[fromKey] ||
      !value[toKey] ||
      Date.parse(value[fromKey]) <= Date.parse(value[toKey]),
    {message: 'Bitiş tarihi başlangıçtan önce olamaz', path: [toKey]},
  );
}

export function getEnumField(enumType, message = 'Geçersiz değer') {
  const values = enumType.values;
  if (values.every(value => typeof value === 'number')) {
    return z.coerce
      .number(message)
      .pipe(z.literal(values, message))
      .meta({type: 'number', enum: values});
  }
  return z.enum(values, message);
}
