import {escapeRegExp, isPlainObject, trimEnd, uniq} from 'es-toolkit';
import {z} from 'zod';
import {URL_MAX_LENGTH} from '../constants/common.js';

const URL_INVALID_MESSAGE = 'Invalid URL';

const URL_TOO_LONG_MESSAGE = `URL must be at most ${URL_MAX_LENGTH} characters`;

export const jwtField = z
  .string('Token is required')
  .min(1, 'Token cannot be empty')
  .refine(
    string => {
      const count = string.split('.').length;
      return count === 3 || count === 5;
    },
    {message: 'Invalid token'},
  );

export const portField = z.coerce
  .number('Port is required')
  .int('Port must be an integer')
  .min(1, 'Port must be between 1 and 65535')
  .max(65535, 'Port must be between 1 and 65535');

export function getUuidField(message) {
  return z.uuid(message).toLowerCase();
}

const idField = getUuidField('Invalid ID');

export const uuidSchema = z.object({
  id: idField,
});

export function getIdListField({max}) {
  return z
    .array(idField, 'Invalid selection')
    .min(1, 'Select at least one record')
    .max(max, `Select at most ${max} records`)
    .transform(ids => uniq(ids));
}

export function getSlugField({min, max}) {
  return z
    .string('Key is required')
    .min(min, `Key must be at least ${min} characters`)
    .max(max, `Key must be at most ${max} characters`)
    .regex(
      /^[a-z0-9-]+$/,
      'Key may contain only lowercase letters, digits and -',
    );
}

export function getIdentifierField(message) {
  return z.string(message).trim().toLowerCase();
}

export const emailField = getIdentifierField('Email is required')
  .regex(z.regexes.email, 'Invalid email')
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

export const isoDateField = z.iso.date('Invalid date');

export const isoDateTimeField = z.iso.datetime('Invalid date');

function getCrossFieldWhen(keys) {
  return ({value, issues}) =>
    isPlainObject(value) &&
    !issues.some(issue => keys.includes(issue.path?.[0]));
}

export function getCrossFieldCheck(keys, isSatisfied, params) {
  return z.refine(isSatisfied, {...params, when: getCrossFieldWhen(keys)});
}

export function getCrossFieldIssueCheck(keys, getIssues) {
  return z.superRefine(
    (value, context) => {
      for (const issue of getIssues(value)) {
        context.addIssue({code: 'custom', input: value, ...issue});
      }
    },
    {when: getCrossFieldWhen(keys)},
  );
}

export function getDateRangeCheck(fromKey = 'from', toKey = 'to') {
  return getCrossFieldCheck(
    [fromKey, toKey],
    value =>
      !value[fromKey] ||
      !value[toKey] ||
      Date.parse(value[fromKey]) <= Date.parse(value[toKey]),
    {message: 'End date cannot be before start date', path: [toKey]},
  );
}

export function getEnumField(enumType, message = 'Invalid value') {
  const values = enumType.values;
  if (values.every(value => typeof value === 'number')) {
    return z.coerce
      .number(message)
      .pipe(z.literal(values, message))
      .meta({type: 'number', enum: values});
  }
  return z.enum(values, message);
}
