import {describe, expect, it} from 'vitest';
import {z} from 'zod';
import {Enum} from 'enum-plus';
import {URL_MAX_LENGTH} from '../src/constants/common.js';
import {
  baseUrlField,
  emailField,
  getBaseUrlField,
  getCrossFieldCheck,
  getDateRangeCheck,
  getEnumField,
  getIdentifierField,
  getIdListField,
  getSlugField,
  getUuidField,
  httpUrlField,
  isoDateField,
  isoDateTimeField,
  jwtField,
  portField,
  uuidSchema,
} from '../src/schemas/common.js';

const uppercaseUuid = '018F3A2B-6C4D-7E8F-9A0B-1C2D3E4F5061';

function firstMessages(field, values) {
  return values.map(value => field.safeParse(value).error?.issues[0]?.message);
}

describe('jwtField', () => {
  it('accepts a signed token and an encrypted one', () => {
    expect(jwtField.safeParse('a.b.c').success).toBe(true);
    expect(jwtField.safeParse('a.b.c.d.e').success).toBe(true);
  });

  it('refuses any other segment count', () => {
    expect(jwtField.safeParse('a.b').success).toBe(false);
    expect(jwtField.safeParse('a.b.c.d').success).toBe(false);
    expect(jwtField.safeParse('').success).toBe(false);
  });
});

describe('portField', () => {
  it('coerces the string form a query or env carries', () => {
    expect(portField.parse('8080')).toBe(8080);
  });

  it('refuses values outside the port range or with a fraction', () => {
    expect(portField.safeParse(0).success).toBe(false);
    expect(portField.safeParse(65536).success).toBe(false);
    expect(portField.safeParse(80.5).success).toBe(false);
  });
});

describe('getUuidField', () => {
  it('normalises case so an id compares the same everywhere', () => {
    expect(getUuidField('bad').parse(uppercaseUuid)).toBe(
      uppercaseUuid.toLowerCase(),
    );
    expect(uuidSchema.parse({id: uppercaseUuid}).id).toBe(
      uppercaseUuid.toLowerCase(),
    );
  });

  it('refuses a non-uuid', () => {
    expect(getUuidField('bad').safeParse('nope').success).toBe(false);
  });
});

describe('getIdListField', () => {
  const field = getIdListField({max: 2});
  const otherUuid = '018f3a2b-6c4d-7e8f-9a0b-1c2d3e4f5062';

  it('normalises and dedupes the ids it accepts', () => {
    expect(field.parse([uppercaseUuid, uppercaseUuid.toLowerCase()])).toEqual([
      uppercaseUuid.toLowerCase(),
    ]);
  });

  it('refuses an empty selection', () => {
    expect(field.safeParse([]).success).toBe(false);
  });

  it('refuses more ids than the cap, duplicates counted', () => {
    expect(field.safeParse([otherUuid, otherUuid, otherUuid]).success).toBe(
      false,
    );
  });

  it('refuses a non-uuid', () => {
    expect(field.safeParse(['nope']).success).toBe(false);
  });
});

describe('getSlugField', () => {
  const field = getSlugField({min: 3, max: 6});

  it('accepts lower-case letters, digits and hyphens within the bounds', () => {
    expect(['abc', 'a-1', 'editor'].map(slug => field.parse(slug))).toEqual([
      'abc',
      'a-1',
      'editor',
    ]);
  });

  it('reports the bound a slug misses', () => {
    expect(firstMessages(field, ['ab', 'abcdefg'])).toEqual([
      'Anahtar en az 3 karakter olmalıdır',
      'Anahtar en fazla 6 karakter olabilir',
    ]);
  });

  it('refuses any other character, without folding case or trimming', () => {
    expect(
      firstMessages(field, ['Admin', 'a_b', 'a b', ' abc', 'çay']),
    ).toEqual(
      Array(5).fill('Anahtar yalnızca küçük harf, rakam ve - içerebilir'),
    );
  });

  it('requires a string', () => {
    expect(firstMessages(field, [undefined])).toEqual(['Anahtar gereklidir']);
  });
});

describe('getIdentifierField', () => {
  it('trims and folds to lower case', () => {
    expect(getIdentifierField('bad').parse('  ADMIN ')).toBe('admin');
  });
});

describe('emailField', () => {
  it('normalises before the format is judged', () => {
    expect(emailField.parse('  ADMIN@Example.COM ')).toBe('admin@example.com');
  });

  it('refuses a value that is not an address', () => {
    expect(emailField.safeParse('admin').success).toBe(false);
    expect(emailField.safeParse('admin@').success).toBe(false);
    expect(emailField.safeParse('admin@example').success).toBe(false);
  });
});

describe('httpUrlField', () => {
  it('accepts an http or https address and trims it', () => {
    expect(httpUrlField.parse(' https://example.com/a.json ')).toBe(
      'https://example.com/a.json',
    );
    expect(httpUrlField.safeParse('http://example.com').success).toBe(true);
  });

  it('refuses a missing value', () => {
    expect(httpUrlField.safeParse(undefined).success).toBe(false);
  });

  it('refuses another scheme, a bare word and a host with no domain', () => {
    const {success, error} = httpUrlField.safeParse('ftp://example.com');
    expect(success).toBe(false);
    expect(error.issues[0].message).toBe('URL geçersiz');
    expect(httpUrlField.safeParse('example').success).toBe(false);
    expect(httpUrlField.safeParse('javascript:alert(1)').success).toBe(false);
    expect(httpUrlField.safeParse('http://localhost:3000').success).toBe(false);
    expect(httpUrlField.safeParse('http://127.0.0.1').success).toBe(false);
  });

  it('caps the trimmed length', () => {
    const base = 'https://example.com/';
    const atCap = `${base}${'a'.repeat(URL_MAX_LENGTH - base.length)}`;
    expect(httpUrlField.safeParse(` ${atCap} `).success).toBe(true);
    const {success, error} = httpUrlField.safeParse(`${atCap}a`);
    expect(success).toBe(false);
    expect(error.issues[0].message).toBe(
      `URL en fazla ${URL_MAX_LENGTH} karakter olabilir`,
    );
  });

  it('documents the scheme it admits', () => {
    expect(z.toJSONSchema(httpUrlField)).toMatchObject({
      format: 'uri',
      pattern: '^https?://',
      maxLength: URL_MAX_LENGTH,
    });
  });
});

describe('baseUrlField', () => {
  it('keeps its own message inside a union, as an optional URL is built', () => {
    const optionalUrlField = z.literal('').or(baseUrlField);
    expect(optionalUrlField.safeParse('').success).toBe(true);
    expect(
      firstMessages(optionalUrlField, [
        'ftp://x',
        'not a url',
        'https://example.com/?x',
        'http://user@api:8080',
      ]),
    ).toEqual(['URL geçersiz', 'URL geçersiz', 'URL geçersiz', 'URL geçersiz']);
  });

  it('accepts a host with no top-level domain, as a service on the same network has', () => {
    expect(
      [
        'https://example.com',
        'http://localhost:3000',
        'http://api:8080',
        'http://127.0.0.1:8080',
        'http://[::1]:8080',
      ].map(url => baseUrlField.safeParse(url).success),
    ).toEqual([true, true, true, true, true]);
  });

  it('refuses anything but an http or https URL', () => {
    expect(
      firstMessages(baseUrlField, [
        'not a url',
        'ftp://example.com',
        'javascript:alert(1)',
      ]),
    ).toEqual(['URL geçersiz', 'URL geçersiz', 'URL geçersiz']);
  });

  it('refuses an address missing its slashes, however the browser would mend it', () => {
    expect(
      firstMessages(baseUrlField, ['http:example.com', 'https:/example.com']),
    ).toEqual(['URL geçersiz', 'URL geçersiz']);
  });

  it('refuses credentials in the address, which a request built on it cannot carry', () => {
    expect(
      firstMessages(baseUrlField, [
        'http://user:secret@api:8080',
        'http://user@api:8080',
      ]),
    ).toEqual(['URL geçersiz', 'URL geçersiz']);
  });

  it('reports a bad address once, however many of its checks it fails', () => {
    expect(baseUrlField.safeParse('ftp://example.com/?x').error.issues).toEqual(
      [expect.objectContaining({message: 'URL geçersiz'})],
    );
  });

  it('refuses a query or a fragment, even an empty one', () => {
    expect(
      firstMessages(baseUrlField, [
        'https://example.com/?region=eu',
        'https://example.com/#top',
        'https://example.com/?',
        'https://example.com#',
      ]),
    ).toEqual(['URL geçersiz', 'URL geçersiz', 'URL geçersiz', 'URL geçersiz']);
  });

  it('trims the address and the trailing slashes a joined path would double', () => {
    expect(
      [' http://api:8080/ ', 'https://example.com/v1//'].map(url =>
        baseUrlField.parse(url),
      ),
    ).toEqual(['http://api:8080', 'https://example.com/v1']);
  });

  it('caps the length', () => {
    const base = 'https://example.com/';
    const atCap = `${base}${'a'.repeat(URL_MAX_LENGTH - base.length)}`;

    expect(baseUrlField.safeParse(atCap).success).toBe(true);
    expect(firstMessages(baseUrlField, [`${atCap}a`])).toEqual([
      `URL en fazla ${URL_MAX_LENGTH} karakter olabilir`,
    ]);
  });

  it('documents the scheme it admits and its query-free shape', () => {
    expect(z.toJSONSchema(baseUrlField)).toMatchObject({
      type: 'string',
      format: 'uri',
      pattern: '^(?:[hH][tT][tT][pP]|[hH][tT][tT][pP][sS])://[^?#]*$',
      maxLength: URL_MAX_LENGTH,
    });
  });
});

describe('getBaseUrlField', () => {
  const httpsBaseUrlField = getBaseUrlField({protocols: ['https']});

  it('admits only the protocols it is given', () => {
    expect(
      ['https://example.com', 'http://example.com', 'ftp://example.com'].map(
        url => httpsBaseUrlField.safeParse(url).success,
      ),
    ).toEqual([true, false, false]);
  });

  it('refuses an address missing its slashes under any protocol list', () => {
    expect(
      firstMessages(httpsBaseUrlField, [
        'https:example.com',
        'https:/example.com',
      ]),
    ).toEqual(['URL geçersiz', 'URL geçersiz']);
  });

  it('keeps every other base URL rule', () => {
    expect(
      firstMessages(httpsBaseUrlField, [
        'https://example.com/?region=eu',
        'https://user:secret@example.com',
      ]),
    ).toEqual(['URL geçersiz', 'URL geçersiz']);
    expect(httpsBaseUrlField.parse(' https://example.com/v1/ ')).toBe(
      'https://example.com/v1',
    );
  });

  it('matches a protocol name literally, whatever characters it holds', () => {
    const field = getBaseUrlField({protocols: ['git+ssh']});

    expect(
      ['git+ssh://example.com', 'gitttssh://example.com'].map(
        url => field.safeParse(url).success,
      ),
    ).toEqual([true, false]);
  });

  it('matches the protocol in any case, keeping the address as written', () => {
    const field = getBaseUrlField({protocols: ['HTTPS']});

    expect(
      ['https://example.com', 'HTTPS://Example.COM/'].map(url =>
        field.parse(url),
      ),
    ).toEqual(['https://example.com', 'HTTPS://Example.COM']);
  });

  it('refuses an address with no host, which its trimmed form would no longer parse as', () => {
    const field = getBaseUrlField({protocols: ['git+ssh']});

    expect(firstMessages(field, ['git+ssh://', 'git+ssh:///repo'])).toEqual([
      'URL geçersiz',
      'URL geçersiz',
    ]);
  });

  it('documents the protocols it admits', () => {
    expect(z.toJSONSchema(httpsBaseUrlField)).toMatchObject({
      format: 'uri',
      pattern: '^(?:[hH][tT][tT][pP][sS])://[^?#]*$',
    });
  });

  it('documents a pattern that holds the runtime rule, in any scheme case and under the unicode flag', () => {
    const field = getBaseUrlField({protocols: ['https', 'git+ssh']});
    const pattern = new RegExp(z.toJSONSchema(field).pattern, 'u');
    const urls = [
      'HTTPS://Example.COM',
      'Git+SSH://example.com',
      'http://example.com',
      'gitttssh://example.com',
      'https://example.com/?q',
    ];

    expect(urls.map(url => pattern.test(url))).toEqual(
      urls.map(url => field.safeParse(url).success),
    );
    expect(urls.map(url => pattern.test(url))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});

describe('isoDateField', () => {
  it('accepts a calendar day and refuses a timestamp or an impossible day', () => {
    expect(isoDateField.parse('2026-02-28')).toBe('2026-02-28');
    expect(isoDateField.safeParse('2026-02-28T00:00:00Z').success).toBe(false);
    expect(isoDateField.safeParse('2026-02-30').success).toBe(false);
  });
});

describe('isoDateTimeField', () => {
  it('accepts a UTC timestamp and refuses a bare day', () => {
    const value = '2026-02-28T21:00:00.000Z';
    expect(isoDateTimeField.parse(value)).toBe(value);
    expect(isoDateTimeField.safeParse('2026-02-28').success).toBe(false);
  });
});

describe('getDateRangeCheck', () => {
  const daySchema = z
    .object({from: isoDateField.optional(), to: isoDateField.optional()})
    .check(getDateRangeCheck());

  const timestampSchema = z
    .object({
      soldFrom: isoDateTimeField.optional(),
      soldTo: isoDateTimeField.optional(),
    })
    .check(getDateRangeCheck('soldFrom', 'soldTo'));

  it('accepts an ordered range, a single day and an open end', () => {
    expect(
      daySchema.safeParse({from: '2026-01-01', to: '2026-01-31'}).success,
    ).toBe(true);
    expect(
      daySchema.safeParse({from: '2026-01-01', to: '2026-01-01'}).success,
    ).toBe(true);
    expect(daySchema.safeParse({from: '2026-01-01'}).success).toBe(true);
    expect(daySchema.safeParse({to: '2026-01-01'}).success).toBe(true);
  });

  it('refuses a reversed range on the end key', () => {
    const result = daySchema.safeParse({from: '2026-02-01', to: '2026-01-31'});
    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(['to']);
  });

  it('compares timestamps by instant, not by spelling', () => {
    expect(
      timestampSchema.safeParse({
        soldFrom: '2026-01-01T10:00:00Z',
        soldTo: '2026-01-01T10:00:00.500Z',
      }).success,
    ).toBe(true);
    const result = timestampSchema.safeParse({
      soldFrom: '2026-01-01T10:00:00.500Z',
      soldTo: '2026-01-01T10:00:00Z',
    });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(['soldTo']);
  });

  it('leaves the order unchecked while either end is itself invalid', () => {
    const result = daySchema.safeParse({from: 'soon', to: '2026-01-31'});
    expect(result.error.issues.map(issue => issue.path)).toEqual([['from']]);
  });
});

describe('getCrossFieldCheck', () => {
  const schema = z
    .object({
      low: z.number().nonnegative(),
      high: z.number(),
      note: z.string(),
    })
    .check(
      getCrossFieldCheck(['low', 'high'], value => value.low <= value.high, {
        message: 'out of order',
        path: ['high'],
      }),
    );

  it('reports only the field error when a key it reads is invalid', () => {
    const result = schema.safeParse({low: -5, high: -9, note: ''});
    expect(result.error.issues.map(issue => issue.message)).not.toContain(
      'out of order',
    );
  });

  it('still runs when only a field it does not read is invalid', () => {
    const result = schema.safeParse({low: 5, high: 1, note: 7});
    expect(result.error.issues.map(issue => issue.path)).toEqual([
      ['note'],
      ['high'],
    ]);
  });

  it('reports a value that is not an object instead of throwing', () => {
    for (const value of [null, undefined, 'range', 5]) {
      const result = schema.safeParse(value);
      expect(result.error.issues.map(issue => issue.code)).toEqual([
        'invalid_type',
      ]);
    }
  });

  it('still runs beside an issue that carries no path', () => {
    const strict = z.strictObject({low: z.number(), high: z.number()}).check(
      getCrossFieldCheck(['low', 'high'], value => value.low <= value.high, {
        message: 'out of order',
        path: ['high'],
      }),
    );
    const result = strict.safeParse({low: 5, high: 1, extra: true});
    expect(result.error.issues.map(issue => issue.code)).toEqual([
      'unrecognized_keys',
      'custom',
    ]);
  });
});

describe('getEnumField', () => {
  const StringEnum = Enum({A: {value: 'a'}, B: {value: 'b'}});
  const NumberEnum = Enum({ONE: {value: 1}, TWO: {value: 2}});

  it('accepts a declared string member and refuses anything else', () => {
    const field = getEnumField(StringEnum);
    expect(field.parse('a')).toBe('a');
    expect(field.safeParse('c').success).toBe(false);
  });

  it('coerces a numeric member arriving as a string', () => {
    const field = getEnumField(NumberEnum);
    expect(field.parse('2')).toBe(2);
    expect(field.safeParse('3').success).toBe(false);
  });
});
