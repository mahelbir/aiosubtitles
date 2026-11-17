import {describe, expect, it} from 'vitest';
import {z} from 'zod';
import {toPatchSchema} from '../src/lib/schema.js';

const schema = z.object({
  label: z.string().default(''),
  notice: z
    .object({
      title: z.string().default(''),
      isShown: z.boolean().default(false),
    })
    .prefault({}),
  contact: z.object({email: z.email()}).nullable(),
  profile: z.object({bio: z.string()}).optional(),
  tags: z.array(z.string()).default([]),
});

const patchSchema = toPatchSchema(schema);

describe('toPatchSchema', () => {
  it('drops every default, so an absent key stays absent', () => {
    expect(patchSchema.parse({})).toEqual({});
    expect(patchSchema.parse({notice: {}})).toEqual({notice: {}});
  });

  it('accepts part of a nested object', () => {
    expect(patchSchema.parse({notice: {isShown: true}})).toEqual({
      notice: {isShown: true},
    });
  });

  it('accepts part of a nested object behind a nullable or an optional', () => {
    expect(patchSchema.parse({contact: {}, profile: {}})).toEqual({
      contact: {},
      profile: {},
    });
    expect(patchSchema.parse({contact: null})).toEqual({contact: null});
    expect(patchSchema.safeParse({profile: {bios: ''}}).success).toBe(false);
  });

  it('rejects an undeclared key at every depth', () => {
    expect(patchSchema.safeParse({lable: 'x'}).success).toBe(false);
    expect(patchSchema.safeParse({notice: {titel: 'x'}}).success).toBe(false);
  });

  it('still validates a nested value it accepts', () => {
    const result = patchSchema.safeParse({notice: {isShown: 'yes'}});
    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(['notice', 'isShown']);
  });

  it('takes an array whole', () => {
    expect(patchSchema.parse({tags: ['a']})).toEqual({tags: ['a']});
    expect(patchSchema.safeParse({tags: [1]}).success).toBe(false);
  });

  const group = z.object({x: z.number().default(0), y: z.number().default(0)});

  it.each([
    ['a catch', group.catch({x: 0, y: 0})],
    ['a readonly', group.readonly()],
    ['a transform', group.transform(value => value)],
    ['a lazy', z.lazy(() => group)],
  ])('accepts part of a nested object behind %s', (_, field) => {
    expect(
      toPatchSchema(z.object({group: field})).parse({group: {x: 5}}),
    ).toEqual({group: {x: 5}});
  });

  it('refuses a value a catch would have replaced', () => {
    const catching = toPatchSchema(z.object({count: z.number().catch(0)}));
    expect(catching.safeParse({count: 'many'}).success).toBe(false);
  });

  it('keeps a pipe whose input has nothing to strip', () => {
    const piped = toPatchSchema(z.object({email: z.string().pipe(z.email())}));
    expect(piped.safeParse({email: 'nope'}).success).toBe(false);
  });

  it('keeps the metadata of a field it rebuilds, but never its id', () => {
    const described = toPatchSchema(
      z.object({
        count: z
          .number()
          .default(0)
          .meta({id: 'patchCount', description: 'Sayı'}),
        group: group.prefault({}).describe('Grup'),
      }),
    );
    const {properties} = z.toJSONSchema(described);
    expect(properties.count.description).toBe('Sayı');
    expect(properties.group.description).toBe('Grup');
    expect(
      z.globalRegistry.get(described.shape.count.unwrap()).id,
    ).toBeUndefined();
  });
});
