import {z} from 'zod';
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../constants/user.js';
import {getMultiFilterField, getOffsetPaginationSchema} from './pagination.js';
import {emailField, getUuidField, uuidSchema} from './common.js';

const roleIdField = getUuidField('Geçersiz rol');

export const USER_SORT_FIELDS = Object.freeze(['id', 'disabledAt']);

export const createUserSchema = z.object({
  email: emailField.max(
    EMAIL_MAX_LENGTH,
    `E-posta en fazla ${EMAIL_MAX_LENGTH} karakter olabilir`,
  ),
  password: z
    .string('Parola gereklidir')
    .min(
      PASSWORD_MIN_LENGTH,
      `Parola en az ${PASSWORD_MIN_LENGTH} karakter olmalıdır`,
    )
    .max(
      PASSWORD_MAX_LENGTH,
      `Parola en fazla ${PASSWORD_MAX_LENGTH} karakter olabilir`,
    ),
  roleIds: z.array(roleIdField, 'Roller geçersiz').default([]),
  disabledAt: z.iso
    .datetime('Devre dışı bırakılma tarihi geçersiz')
    .nullable()
    .optional(),
});

export const updateUserSchema = createUserSchema.partial().extend({
  roleIds: z.array(roleIdField, 'Roller geçersiz').optional(),
});

export const updateSelfSchema = updateUserSchema
  .omit({roleIds: true, disabledAt: true})
  .strict();

export const updateProfileSchema = createUserSchema
  .pick({email: true})
  .partial();

export const changePasswordSchema = z.object({
  currentPassword: z
    .string('Mevcut parola gereklidir')
    .min(1, 'Mevcut parola gereklidir'),
  password: createUserSchema.shape.password,
});

export const getUserSchema = uuidSchema.extend({});

export const listUsersSchema = getOffsetPaginationSchema({
  sort: USER_SORT_FIELDS,
  disabled: getMultiFilterField(z.stringbool(), 'Durum geçersiz').optional(),
  roleId: getMultiFilterField(roleIdField, 'Geçersiz rol').optional(),
});
