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
    .number('Sayfa numarası sayı olmalıdır')
    .int('Sayfa numarası tam sayı olmalıdır')
    .min(1, 'Sayfa numarası en az 1 olmalıdır')
    .default(DEFAULT_PAGE_NUMBER),
  pageSize: z.coerce
    .number('Sayfa başına kayıt sayısı sayı olmalıdır')
    .int('Sayfa başına kayıt sayısı tam sayı olmalıdır')
    .min(1, 'Sayfa başına en az 1 kayıt gösterilmelidir')
    .max(
      MAX_PAGE_SIZE,
      `Sayfa başına en fazla ${MAX_PAGE_SIZE} kayıt gösterilebilir`,
    )
    .default(DEFAULT_PAGE_SIZE),
  windowSize: z.coerce
    .number('Sayfa penceresi sayı olmalıdır')
    .int('Sayfa penceresi tam sayı olmalıdır')
    .min(1, 'Sayfa penceresi en az 1 olmalıdır')
    .max(
      MAX_WINDOW_SIZE,
      `Sayfa penceresi en fazla ${MAX_WINDOW_SIZE} olabilir`,
    )
    .optional(),
  search: z
    .string('Arama metni geçersiz')
    .trim()
    .min(
      SEARCH_MIN_LENGTH,
      `Arama en az ${SEARCH_MIN_LENGTH} karakter olmalıdır`,
    )
    .max(
      SEARCH_MAX_LENGTH,
      `Arama en fazla ${SEARCH_MAX_LENGTH} karakter olabilir`,
    )
    .optional(),
  id: getMultiFilterField(getUuidField('Geçersiz ID')).optional(),
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
    message: 'Sıralama alanı geçersiz',
  }).optional();
}

export function getOffsetPaginationSchema({sort, ...shape} = {}) {
  return offsetPaginationSchema.extend({
    ...(sort && {sort: getSortField(sort)}),
    ...shape,
  });
}
