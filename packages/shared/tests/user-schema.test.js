import {describe, expect, it} from 'vitest';
import {EMAIL_MAX_LENGTH, PASSWORD_MIN_LENGTH} from '../src/constants/user.js';
import {
  createUserSchema,
  listUsersSchema,
  updateSelfSchema,
  updateUserSchema,
} from '../src/schemas/user.js';

const validUuid = '018f3a2b-6c4d-7e8f-9a0b-1c2d3e4f5061';

describe('createUserSchema', () => {
  it('folds the email to lower case and trims it', () => {
    const parsed = createUserSchema.parse({
      email: '  MixedCase@Example.COM  ',
      password: 'a'.repeat(PASSWORD_MIN_LENGTH),
    });
    expect(parsed.email).toBe('mixedcase@example.com');
  });

  it('defaults roleIds to an empty list', () => {
    const parsed = createUserSchema.parse({
      email: 'someone@example.com',
      password: 'a'.repeat(PASSWORD_MIN_LENGTH),
    });
    expect(parsed.roleIds).toEqual([]);
  });

  it.each([
    ['missing the domain', 'someone'],
    ['missing the local part', '@example.com'],
    ['carrying a space', 'some one@example.com'],
    ['longer than the column', `${'a'.repeat(EMAIL_MAX_LENGTH)}@example.com`],
  ])('refuses an email %s', (_label, email) => {
    const result = createUserSchema.safeParse({
      email,
      password: 'a'.repeat(PASSWORD_MIN_LENGTH),
    });
    expect(result.success).toBe(false);
  });

  it('refuses a password below the floor', () => {
    const result = createUserSchema.safeParse({
      email: 'someone@example.com',
      password: 'a'.repeat(PASSWORD_MIN_LENGTH - 1),
    });
    expect(result.success).toBe(false);
  });

  it('refuses a role id that is not a uuid', () => {
    const result = createUserSchema.safeParse({
      email: 'someone@example.com',
      password: 'a'.repeat(PASSWORD_MIN_LENGTH),
      roleIds: ['not-a-uuid'],
    });
    expect(result.success).toBe(false);
  });
});

describe('updateSelfSchema', () => {
  it('is strict, so editing yourself cannot smuggle privileged fields', () => {
    expect(updateSelfSchema.safeParse({roleIds: [validUuid]}).success).toBe(
      false,
    );
    expect(updateSelfSchema.safeParse({disabledAt: null}).success).toBe(false);
  });

  it('still accepts the fields it does own', () => {
    expect(
      updateSelfSchema.safeParse({email: 'renamed@example.com'}).success,
    ).toBe(true);
  });

  it('differs from the general update schema, which does carry them', () => {
    expect(updateUserSchema.safeParse({roleIds: [validUuid]}).success).toBe(
      true,
    );
  });
});

describe('listUsersSchema', () => {
  it('reads the disabled filter as booleans in array form', () => {
    expect(listUsersSchema.parse({disabled: 'true'}).disabled).toEqual([true]);
    expect(
      listUsersSchema.parse({disabled: ['true', 'false']}).disabled,
    ).toEqual([true, false]);
  });

  it('rejects a non-boolean disabled value', () => {
    expect(listUsersSchema.safeParse({disabled: 'maybe'}).success).toBe(false);
  });

  it('rejects a sort field the endpoint does not expose', () => {
    expect(listUsersSchema.safeParse({sort: ['password']}).success).toBe(false);
  });
});
