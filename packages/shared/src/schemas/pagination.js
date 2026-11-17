import {z} from 'zod';
import {uniq} from 'es-toolkit';
import {
  DEFAULT_PAGE_NUMBER,
  DEFAULT_PAGE_SIZE,
  MAX_WINDOW_SIZE,
  MAX_FILTER_VALUES,
  MAX_PAGE_SIZE,
  SEARCH_MAX_LENGTH,
  SEARCH_MIN_LENGTH,
} from '../constants/pagination.js';
import {getUuidField} from './common.js';

const offsetPaginationSchema = z.object({
  pageNumber: z.coerce
    .number('Page number must be a number')
    .int('Page number must be an integer')
    .min(1, 'Page number must be at least 1')
    .default(DEFAULT_PAGE_NUMBER),
  pageSize: z.coerce
    .number('Page size must be a number')
    .int('Page size must be an integer')
    .min(1, 'Page size must be at least 1')
    .max(MAX_PAGE_SIZE, `Page size must be at most ${MAX_PAGE_SIZE}`)
    .default(DEFAULT_PAGE_SIZE),
  windowSize: z.coerce
    .number('Page window must be a number')
    .int('Page window must be an integer')
    .min(1, 'Page window must be at least 1')
    .max(MAX_WINDOW_SIZE, `Page window must be at most ${MAX_WINDOW_SIZE}`)
    .optional(),
  search: z
    .string('Invalid search text')
    .trim()
    .min(
      SEARCH_MIN_LENGTH,
      `Search must be at least ${SEARCH_MIN_LENGTH} characters`,
    )
    .max(
      SEARCH_MAX_LENGTH,
      `Search must be at most ${SEARCH_MAX_LENGTH} characters`,
    )
    .optional(),
  id: getMultiFilterField(getUuidField('Invalid ID')).optional(),
});

export function getMultiFilterField(schema, options = {}) {
  const {max = MAX_FILTER_VALUES, message} =
    typeof options === 'string' ? {message: options} : options;
  return z
    .union([z.array(schema).max(max), schema], message)
    .transform(value => uniq(Array.isArray(value) ? value : [value]));
}

export function getSortField(fields) {
  const values = fields.flatMap(field => [field, `-${field}`]);
  return getMultiFilterField(z.enum(values), {
    max: fields.length,
    message: 'Invalid sort field',
  }).optional();
}

export function getOffsetPaginationSchema({sort, ...shape} = {}) {
  return offsetPaginationSchema.extend({
    ...(sort && {sort: getSortField(sort)}),
    ...shape,
  });
}
