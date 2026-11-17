import {cloneDeep, range} from 'es-toolkit';
import {describe, expect, it} from 'vitest';
import {withApiQuery, withQuery} from '../src/lib/url-query.js';

describe('withApiQuery', () => {
  it('returns the path as is when there is no query', () => {
    expect(withApiQuery('/users')).toBe('/users');
    expect(withApiQuery('/users', null)).toBe('/users');
    expect(withApiQuery('/users', {})).toBe('/users');
  });

  it('returns a path that already carries its query untouched', () => {
    expect(withApiQuery('/users?pageNumber=2&pageSize=25')).toBe(
      '/users?pageNumber=2&pageSize=25',
    );
  });

  it('returns the path when no value in the query survives', () => {
    expect(
      withApiQuery('/users', {
        search: '',
        sort: [],
        roleId: null,
        disabled: undefined,
      }),
    ).toBe('/users');
  });

  it('sends only the set fields of a default list page', () => {
    expect(
      withApiQuery('/users', {
        pageNumber: 1,
        pageSize: 25,
        search: '',
        sort: [],
        windowSize: 5,
        roleId: null,
        disabled: null,
      }),
    ).toBe('/users?pageNumber=1&pageSize=25&windowSize=5');
  });

  it('sends a paged, searched, sorted and filtered list page', () => {
    expect(
      withApiQuery('/users', {
        pageNumber: 3,
        pageSize: 50,
        search: 'ada',
        sort: ['-createdAt', 'email'],
        windowSize: 5,
        roleId: ['2', '7'],
        disabled: [false],
      }),
    ).toBe(
      '/users?disabled=false&pageNumber=3&pageSize=50&roleId=2&roleId=7' +
        '&search=ada&sort=-createdAt&sort=email&windowSize=5',
    );
  });

  it('sends the page query of an option source', () => {
    expect(withApiQuery('/roles', {pageNumber: 1, pageSize: 100})).toBe(
      '/roles?pageNumber=1&pageSize=100',
    );
    expect(
      withApiQuery('/users', {pageNumber: 2, pageSize: 20, search: 'ali'}),
    ).toBe('/users?pageNumber=2&pageSize=20&search=ali');
  });

  it('sends the ids of selected options as repeated keys', () => {
    expect(
      withApiQuery('/users', {pageNumber: 1, pageSize: 100, id: [3, 17, 4]}),
    ).toBe('/users?id=3&id=17&id=4&pageNumber=1&pageSize=100');
  });

  it('orders the keys by code unit whatever order they arrive in', () => {
    expect(withApiQuery('/x', {b: 1, a: 2, B: 3, _: 4})).toBe(
      '/x?B=3&_=4&a=2&b=1',
    );
  });

  it('keeps the order of an array longer than ten values', () => {
    expect(withApiQuery('/users', {id: range(1, 13)})).toBe(
      '/users?id=1&id=2&id=3&id=4&id=5&id=6&id=7&id=8&id=9&id=10&id=11&id=12',
    );
  });

  it('keeps the order of the values inside an array', () => {
    expect(withApiQuery('/x', {sort: ['name', '-id', 'email']})).toBe(
      '/x?sort=name&sort=-id&sort=email',
    );
  });

  it('keeps falsy values that are not empty', () => {
    expect(
      withApiQuery('/x', {pageNumber: 0, disabled: false, ratio: Number.NaN}),
    ).toBe('/x?disabled=false&pageNumber=0&ratio=NaN');
    expect(withApiQuery('/x', {disabled: [false, true, 0]})).toBe(
      '/x?disabled=false&disabled=true&disabled=0',
    );
  });

  it('skips null, undefined and empty strings inside an array', () => {
    expect(withApiQuery('/x', {roleId: ['1', null, '', undefined, '2']})).toBe(
      '/x?roleId=1&roleId=2',
    );
    expect(withApiQuery('/x', {roleId: [null, '', undefined]})).toBe('/x');
  });

  it('skips the holes of a sparse array', () => {
    const roleId = [];
    roleId[2] = '9';

    expect(withApiQuery('/x', {roleId})).toBe('/x?roleId=9');
  });

  it('keeps a string that is only whitespace', () => {
    expect(withApiQuery('/x', {search: ' '})).toBe('/x?search=%20');
  });

  it('sends a date as its ISO string', () => {
    expect(
      withApiQuery('/x', {createdAfter: new Date('2026-01-02T03:04:05.006Z')}),
    ).toBe('/x?createdAfter=2026-01-02T03%3A04%3A05.006Z');
  });

  it('sends every date inside an array as its ISO string', () => {
    expect(
      withApiQuery('/x', {
        createdAt: [
          new Date('2026-01-01T00:00:00.000Z'),
          new Date('2026-12-31T23:59:59.999Z'),
        ],
      }),
    ).toBe(
      '/x?createdAt=2026-01-01T00%3A00%3A00.000Z' +
        '&createdAt=2026-12-31T23%3A59%3A59.999Z',
    );
  });

  it('throws on an invalid date', () => {
    expect(() => withApiQuery('/x', {at: new Date(Number.NaN)})).toThrow(
      RangeError,
    );
  });

  it('leaves the query it was given untouched', () => {
    const query = {
      pageNumber: 1,
      search: '',
      sort: ['name'],
      createdAt: [new Date('2026-01-01T00:00:00.000Z')],
      at: new Date('2026-02-01T00:00:00.000Z'),
    };
    const before = cloneDeep(query);

    withApiQuery('/x', query);

    expect(query).toStrictEqual(before);
    expect(query.at).toBeInstanceOf(Date);
    expect(query.createdAt[0]).toBeInstanceOf(Date);
  });

  it('percent-encodes Turkish letters as UTF-8', () => {
    expect(withApiQuery('/x', {search: 'Çağrı Işık İğneci öü'})).toBe(
      '/x?search=%C3%87a%C4%9Fr%C4%B1%20I%C5%9F%C4%B1k%20%C4%B0%C4%9Fneci' +
        '%20%C3%B6%C3%BC',
    );
  });

  it('encodes a space as %20, never as a plus sign', () => {
    expect(withApiQuery('/x', {search: 'a b  c'})).toBe(
      '/x?search=a%20b%20%20c',
    );
  });

  it('encodes the characters that would break the query apart', () => {
    expect(withApiQuery('/x', {search: 'a&b=c?d#e/f+g%h,i;j:k@l$m'})).toBe(
      '/x?search=a%26b%3Dc%3Fd%23e%2Ff%2Bg%25h%2Ci%3Bj%3Ak%40l%24m',
    );
  });

  it('encodes the characters encodeURIComponent leaves alone', () => {
    expect(withApiQuery('/x', {search: "!'()*"})).toBe(
      '/x?search=%21%27%28%29%2A',
    );
  });

  it('leaves the unreserved characters as they are', () => {
    expect(withApiQuery('/x', {search: 'Az09-_.~'})).toBe('/x?search=Az09-_.~');
  });

  it('encodes an e-mail address searched for', () => {
    expect(withApiQuery('/users', {search: 'e2e+key.1@example.com'})).toBe(
      '/users?search=e2e%2Bkey.1%40example.com',
    );
  });

  it('encodes characters outside the Basic Multilingual Plane', () => {
    expect(withApiQuery('/x', {search: '😀Ж'})).toBe(
      '/x?search=%F0%9F%98%80%D0%96',
    );
  });

  it('encodes the keys as well as the values', () => {
    expect(withApiQuery('/x', {'a b': 1, ç: 2, "k'": 3})).toBe(
      '/x?a%20b=1&k%27=3&%C3%A7=2',
    );
  });

  it('drops a __proto__ key', () => {
    expect(withApiQuery('/x', JSON.parse('{"__proto__": "1", "a": "2"}'))).toBe(
      '/x?a=2',
    );
  });

  it('writes a bigint as its digits', () => {
    expect(withApiQuery('/x', {big: 10n})).toBe('/x?big=10');
  });
});

describe('withQuery', () => {
  it('returns the url as is when there is no query', () => {
    expect(withQuery('/admin/fixtures/form-controls')).toBe(
      '/admin/fixtures/form-controls',
    );
    expect(withQuery('/admin/fixtures/form-controls', {})).toBe(
      '/admin/fixtures/form-controls',
    );
  });

  it('opens a fixture variant from its scenario params', () => {
    expect(withQuery('/admin/fixtures/admin-nav', {isCollapsed: true})).toBe(
      '/admin/fixtures/admin-nav?isCollapsed=true',
    );
    expect(withQuery('/admin/fixtures/array-input', {count: 0})).toBe(
      '/admin/fixtures/array-input?count=0',
    );
    expect(
      withQuery('/admin/fixtures/form-controls', {options: 'members', max: 2}),
    ).toBe('/admin/fixtures/form-controls?max=2&options=members');
  });

  it('keeps an empty string as a key with an empty value', () => {
    expect(withQuery('/admin/fixtures/boundaries', {entity: ''})).toBe(
      '/admin/fixtures/boundaries?entity=',
    );
  });

  it('writes null as a bare key', () => {
    expect(withQuery('/admin/fixtures/boundaries', {entity: null})).toBe(
      '/admin/fixtures/boundaries?entity',
    );
  });

  it('drops an undefined value', () => {
    expect(withQuery('/x', {entity: undefined, isDisabled: true})).toBe(
      '/x?isDisabled=true',
    );
    expect(withQuery('/x', {entity: undefined})).toBe('/x');
  });

  it('keeps null and empty strings inside an array but drops undefined', () => {
    expect(withQuery('/x', {tag: ['a', null, '', undefined, 'b']})).toBe(
      '/x?tag=a&tag&tag=&tag=b',
    );
  });

  it('drops a __proto__ key', () => {
    expect(withQuery('/x', JSON.parse('{"__proto__": null, "a": "2"}'))).toBe(
      '/x?a=2',
    );
  });

  it('drops an empty array', () => {
    expect(withQuery('/x', {tag: [], page: 1})).toBe('/x?page=1');
  });

  it('deep-links a list search to an edit panel', () => {
    expect(
      withQuery('/admin/users', {
        search: 'e2e-key@example.com',
        action: 'edit',
        id: 42,
      }),
    ).toBe('/admin/users?action=edit&id=42&search=e2e-key%40example.com');
  });

  it('opens a create panel', () => {
    expect(withQuery('/admin/users', {action: 'create'})).toBe(
      '/admin/users?action=create',
    );
  });

  it('encodes the same way the API query does', () => {
    expect(withQuery('/x', {'q (1)': "it's *Çok* iyi!"})).toBe(
      '/x?q%20%281%29=it%27s%20%2A%C3%87ok%2A%20iyi%21',
    );
  });
});
