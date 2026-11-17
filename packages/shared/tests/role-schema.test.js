import {describe, expect, it} from 'vitest';
import {createRoleSchema, updateRoleSchema} from '../src/schemas/role.js';

describe('createRoleSchema', () => {
  it('trims the label before it is stored', () => {
    const parsed = createRoleSchema.parse({
      slug: 'editor',
      label: '  Editör  ',
    });
    expect(parsed.label).toBe('Editör');
  });

  it('refuses a label made of spaces', () => {
    const result = createRoleSchema.safeParse({slug: 'editor', label: '   '});
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ['label'],
        message: 'Ad en az 2 karakter olmalıdır',
      }),
    ]);
  });
});

describe('updateRoleSchema', () => {
  it('refuses a label made of spaces', () => {
    expect(updateRoleSchema.safeParse({label: '   '}).success).toBe(false);
  });
});
