import {z} from 'zod';
import {Permission} from '../constants/permission.js';
import {
  ROLE_LABEL_MAX_LENGTH,
  ROLE_LABEL_MIN_LENGTH,
  ROLE_SLUG_MAX_LENGTH,
  ROLE_SLUG_MIN_LENGTH,
  RoleDirection,
  RolePlacement,
} from '../constants/role.js';
import {getOffsetPaginationSchema} from './pagination.js';
import {
  getEnumField,
  getSlugField,
  getUuidField,
  uuidSchema,
} from './common.js';

const permissionsField = z.array(
  getEnumField(Permission, 'Geçersiz izin'),
  'İzinler geçersiz',
);

export const createRoleSchema = z.object({
  slug: getSlugField({min: ROLE_SLUG_MIN_LENGTH, max: ROLE_SLUG_MAX_LENGTH}),
  label: z
    .string('Ad gereklidir')
    .trim()
    .min(
      ROLE_LABEL_MIN_LENGTH,
      `Ad en az ${ROLE_LABEL_MIN_LENGTH} karakter olmalıdır`,
    )
    .max(
      ROLE_LABEL_MAX_LENGTH,
      `Ad en fazla ${ROLE_LABEL_MAX_LENGTH} karakter olabilir`,
    ),
  anchorRoleId: getUuidField('Geçersiz rol').nullish(),
  placement: getEnumField(RolePlacement, 'Geçersiz konum').default(
    RolePlacement.BELOW,
  ),
  permissions: permissionsField.default([]),
});

export const updateRoleSchema = createRoleSchema.partial().extend({
  permissions: permissionsField.optional(),
});

export const getRoleSchema = uuidSchema.extend({});

export const moveRoleSchema = z.object({
  direction: getEnumField(RoleDirection, 'Geçersiz yön'),
});

export const listRolesSchema = getOffsetPaginationSchema();
