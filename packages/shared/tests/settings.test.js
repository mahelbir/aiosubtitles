import {describe, expect, it} from 'vitest';
import {z} from 'zod';
import {defineSettings, getSettingsRule} from '../src/lib/settings.js';

const definition = defineSettings({
  editableFields: {
    label: z.string().trim().default(''),
    limit: z.coerce.number().int().nonnegative().default(0),
    isEnabled: z.union([z.boolean(), z.stringbool()]).default(false),
  },
  serverFields: {
    revision: z.coerce.number().int().nonnegative().default(0),
  },
  rules: [
    getSettingsRule(
      ['isEnabled', 'limit'],
      settings => !settings.isEnabled || settings.limit > 0,
      {message: 'Etkinken sınır sıfırdan büyük olmalıdır', path: ['limit']},
    ),
  ],
});

describe('schema', () => {
  it('fills every field, so a truncated file still reads', () => {
    expect(definition.schema.parse({})).toEqual({
      label: '',
      limit: 0,
      isEnabled: false,
      revision: 0,
    });
  });

  it('keeps the fields only the server writes out of the editable schema', () => {
    expect(Object.keys(definition.editableSchema.shape)).toEqual([
      'label',
      'limit',
      'isEnabled',
    ]);
  });
});

describe('updateSchema', () => {
  it('drops the defaults, so an absent key means "leave it alone"', () => {
    expect(definition.updateSchema.parse({})).toEqual({});
  });

  it('is strict, so a typo is rejected rather than silently ignored', () => {
    expect(definition.updateSchema.safeParse({limt: 1}).success).toBe(false);
  });

  it('refuses a field only the server writes', () => {
    expect(definition.updateSchema.safeParse({revision: 1}).success).toBe(
      false,
    );
  });

  it('still validates the fields it does accept', () => {
    expect(definition.updateSchema.parse({limit: '7'})).toEqual({limit: 7});
    expect(definition.updateSchema.safeParse({limit: 'many'}).success).toBe(
      false,
    );
  });
});

describe('schema rules', () => {
  it('refuses a value set that breaks a rule', () => {
    const result = definition.schema.safeParse({isEnabled: true, limit: 0});
    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(['limit']);
  });

  it('accepts a value set that meets every rule', () => {
    expect(
      definition.schema.safeParse({isEnabled: true, limit: 2}).success,
    ).toBe(true);
  });

  it('leaves a rule unchecked while a key it reads is invalid', () => {
    const result = definition.schema.safeParse({isEnabled: true, limit: -1});
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0].path).toEqual(['limit']);
  });

  it('accepts any valid value set when no rule is declared', () => {
    const bare = defineSettings({editableFields: {label: z.string()}});
    expect(bare.schema.safeParse({label: 'x'}).success).toBe(true);
  });
});

describe('getChecksWithin', () => {
  it('runs a rule once every key it reads is named', () => {
    const checks = definition.getChecksWithin(['label', 'isEnabled', 'limit']);
    const result = definition.editableSchema
      .check(...checks)
      .safeParse({isEnabled: true, limit: 0});
    expect(checks).toHaveLength(1);
    expect(result.success).toBe(false);
  });

  it('skips a rule that reads a key left unnamed', () => {
    expect(definition.getChecksWithin(['isEnabled'])).toEqual([]);
  });

  it('runs every rule when no keys are named', () => {
    expect(definition.getChecksWithin()).toHaveLength(1);
  });
});
