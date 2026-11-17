import {randomUUID} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {z} from 'zod';
import {
  DEFAULT_PAGE_NUMBER,
  DEFAULT_PAGE_SIZE,
  MAX_FILTER_VALUES,
  MAX_PAGE_SIZE,
  SEARCH_MIN_LENGTH,
} from '../src/constants/pagination.js';
import {
  getMultiFilterField,
  getOffsetPaginationSchema,
  getSortField,
} from '../src/schemas/pagination.js';

const UUID_A = randomUUID();
const UUID_B = randomUUID();

describe('getMultiFilterField', () => {
  const field = getMultiFilterField(z.string());

  it('lifts a scalar into an array so one and many read the same', () => {
    expect(field.parse('a')).toEqual(['a']);
  });

  it('deduplicates repeated values', () => {
    expect(field.parse(['a', 'b', 'a'])).toEqual(['a', 'b']);
  });

  it('caps the number of values', () => {
    const tooMany = Array.from({length: MAX_FILTER_VALUES + 1}, (_u, i) =>
      String(i),
    );
    expect(field.safeParse(tooMany).success).toBe(false);
  });

  it('rejects a value the inner schema refuses', () => {
    expect(field.safeParse([1]).success).toBe(false);
  });
});

describe('getSortField', () => {
  const field = getSortField(['id', 'email']);

  it('accepts a field and its descending form', () => {
    expect(field.parse(['email', '-id'])).toEqual(['email', '-id']);
  });

  it('rejects a field that was not declared', () => {
    expect(field.safeParse(['password']).success).toBe(false);
    expect(field.safeParse(['-password']).success).toBe(false);
  });

  it('caps at the number of declared fields', () => {
    expect(field.safeParse(['id', '-id', 'email']).success).toBe(false);
  });
});

describe('getOffsetPaginationSchema', () => {
  const schema = getOffsetPaginationSchema({sort: ['id']});

  it('applies the paging defaults', () => {
    const parsed = schema.parse({});
    expect(parsed.pageNumber).toBe(DEFAULT_PAGE_NUMBER);
    expect(parsed.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it('coerces the numeric strings a query string carries', () => {
    expect(schema.parse({pageNumber: '3', pageSize: '10'})).toMatchObject({
      pageNumber: 3,
      pageSize: 10,
    });
  });

  it('refuses a page size above the cap', () => {
    expect(schema.safeParse({pageSize: MAX_PAGE_SIZE + 1}).success).toBe(false);
  });

  it('refuses a page number below one', () => {
    expect(schema.safeParse({pageNumber: 0}).success).toBe(false);
  });

  it('trims the search term and enforces its floor', () => {
    expect(schema.parse({search: '  ab  '}).search).toBe('ab');
    expect(
      schema.safeParse({search: 'x'.repeat(SEARCH_MIN_LENGTH - 1)}).success,
    ).toBe(false);
  });

  it('drops nothing when sort is absent', () => {
    expect(getOffsetPaginationSchema().parse({}).sort).toBeUndefined();
  });

  it('accepts one or many ids and lifts them into an array', () => {
    expect(getOffsetPaginationSchema().parse({id: UUID_A}).id).toEqual([
      UUID_A,
    ]);
    expect(
      getOffsetPaginationSchema().parse({id: [UUID_A, UUID_B]}).id,
    ).toEqual([UUID_A, UUID_B]);
  });

  it('refuses an id that is not a UUID', () => {
    expect(getOffsetPaginationSchema().safeParse({id: '5'}).success).toBe(
      false,
    );
  });

  it('caps the id filter at MAX_FILTER_VALUES', () => {
    const tooMany = Array.from({length: MAX_FILTER_VALUES + 1}, () =>
      randomUUID(),
    );
    expect(getOffsetPaginationSchema().safeParse({id: tooMany}).success).toBe(
      false,
    );
  });

  it('lets a list override the id field', () => {
    const overridden = getOffsetPaginationSchema({
      id: getMultiFilterField(z.coerce.number().int()),
    });
    expect(overridden.parse({id: '5'}).id).toEqual([5]);
  });
});
