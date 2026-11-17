import {describe, expect, it} from 'vitest';
import {Op} from 'sequelize';
import {DEFAULT_PAGE_SIZE} from '@repo/shared/constants/pagination.js';
import {paginateByOffset} from '../../src/db/pagination.js';

/* A stand-in model: the query builder only needs the attribute map and the page
   reader, so the whole layer is exercised without a database. */
function fakeModel({
  attributes = {},
  associations = {},
  rows = [],
  count = 0,
  scope = {attributes: ['id']},
} = {}) {
  const calls = [];
  return {
    calls,
    associations,
    _scope: scope,
    getAttributes: () => attributes,
    findOffsetPage(offset, limit, findOptions) {
      calls.push({offset, limit, findOptions});
      return Promise.resolve({rows, count});
    },
  };
}

const userLike = overrides =>
  fakeModel({
    attributes: {
      id: {primaryKey: true},
      email: {allowNull: false},
      disabledAt: {allowNull: true},
    },
    ...overrides,
  });

const lastQuery = model => model.calls.at(-1);

describe('column list', () => {
  it('refuses a page whose columns nobody named', async () => {
    const model = userLike({scope: {}});
    await expect(paginateByOffset(model, {})).rejects.toThrow(
      'without named attributes',
    );
    expect(model.calls).toHaveLength(0);
  });

  it('reads the columns the call names', async () => {
    const model = userLike({scope: {}});
    await paginateByOffset(model, {}, {attributes: ['id', 'email']});
    expect(lastQuery(model).findOptions.attributes).toEqual(['id', 'email']);
  });

  it('accepts the columns a scope already names', async () => {
    const model = userLike({scope: {attributes: {exclude: ['password']}}});
    await expect(paginateByOffset(model, {})).resolves.toBeDefined();
  });
});

describe('paging arithmetic', () => {
  it('translates page number and size into an offset', async () => {
    const model = userLike();
    await paginateByOffset(model, {pageNumber: 3, pageSize: 10});
    expect(lastQuery(model)).toMatchObject({offset: 20, limit: 10});
  });

  it('falls back to the defaults for an unreadable value', async () => {
    const model = userLike();
    await paginateByOffset(model, {pageNumber: 'abc', pageSize: 'abc'});
    expect(lastQuery(model)).toMatchObject({
      offset: 0,
      limit: DEFAULT_PAGE_SIZE,
    });
  });

  it('clamps a negative page size to one rather than restoring the default', async () => {
    const model = userLike();
    await paginateByOffset(model, {pageNumber: -3, pageSize: -5});
    expect(lastQuery(model)).toMatchObject({offset: 0, limit: 1});
  });

  it('reports an empty range for an empty page', async () => {
    const model = userLike({rows: [], count: 0});
    const result = await paginateByOffset(model, {});
    expect(result.meta).toMatchObject({
      rangeStart: 0,
      rangeEnd: 0,
      totalItemCount: 0,
      totalPageCount: 1,
    });
  });

  it('reports the range the page actually covers', async () => {
    const model = userLike({rows: [{}, {}], count: 12});
    const result = await paginateByOffset(model, {pageNumber: 2, pageSize: 5});
    expect(result.meta).toMatchObject({
      rangeStart: 6,
      rangeEnd: 7,
      totalPageCount: 3,
    });
  });
});

describe('links', () => {
  it('omits previous on the first page and next on the last', async () => {
    const model = userLike({rows: [{}], count: 3});
    const first = await paginateByOffset(model, {pageNumber: 1, pageSize: 1});
    expect(first.links).toMatchObject({previous: null, next: 2, last: 3});

    const last = await paginateByOffset(model, {pageNumber: 3, pageSize: 1});
    expect(last.links).toMatchObject({previous: 2, next: null});
  });

  it('clamps previous when the requested page is past the end', async () => {
    const model = userLike({rows: [], count: 3});
    const result = await paginateByOffset(model, {pageNumber: 99, pageSize: 1});
    expect(result.links.previous).toBe(3);
  });

  it('emits a window only when one is asked for', async () => {
    const model = userLike({rows: [{}], count: 10});
    const without = await paginateByOffset(model, {pageSize: 1});
    expect(without.links.window).toBeUndefined();

    const withWindow = await paginateByOffset(model, {
      pageNumber: 5,
      pageSize: 1,
      windowSize: 3,
    });
    expect(withWindow.links.window).toEqual([4, 5, 6]);
  });

  it('slides the window inward at the edges instead of running off them', async () => {
    const model = userLike({rows: [{}], count: 10});
    const atStart = await paginateByOffset(model, {
      pageNumber: 1,
      pageSize: 1,
      windowSize: 3,
    });
    expect(atStart.links.window).toEqual([1, 2, 3]);

    const atEnd = await paginateByOffset(model, {
      pageNumber: 10,
      pageSize: 1,
      windowSize: 3,
    });
    expect(atEnd.links.window).toEqual([8, 9, 10]);
  });
});

describe('filter allowlist', () => {
  it('filters on a query key the model owns', async () => {
    const model = userLike();
    await paginateByOffset(model, {email: 'someone'});
    expect(lastQuery(model).findOptions.where).toEqual({email: 'someone'});
  });

  it('ignores a query key the model does not own and no rule covers', async () => {
    const model = userLike();
    await paginateByOffset(model, {password: 'x', role: 'admin'});
    expect(lastQuery(model).findOptions.where).toEqual({});
  });

  it('never treats a reserved paging key as a column', async () => {
    const model = fakeModel({attributes: {search: {}, sort: {}}});
    await paginateByOffset(model, {search: 'ab', sort: []});
    expect(lastQuery(model).findOptions.where).toEqual({});
  });

  it('lets an explicit rule override the default equality', async () => {
    const model = userLike();
    await paginateByOffset(
      model,
      {email: 'a'},
      {
        filters: {email: value => ({label: value})},
      },
    );
    expect(lastQuery(model).findOptions.where).toEqual({label: 'a'});
  });

  it('opts a key out entirely when its rule is false', async () => {
    const model = userLike();
    await paginateByOffset(model, {email: 'a'}, {filters: {email: false}});
    expect(lastQuery(model).findOptions.where).toEqual({});
  });

  it('skips a rule that returns nothing', async () => {
    const model = userLike();
    await paginateByOffset(
      model,
      {email: 'a'},
      {
        filters: {email: () => undefined},
      },
    );
    expect(lastQuery(model).findOptions.where).toEqual({});
  });

  it.each([
    ['undefined', undefined],
    ['empty string', ''],
    ['empty array', []],
  ])('treats a %s value as no filter at all', async (_label, value) => {
    const model = userLike();
    await paginateByOffset(model, {email: value});
    expect(lastQuery(model).findOptions.where).toEqual({});
  });

  it('turns a repeated param into a set membership test', async () => {
    const model = userLike();
    await paginateByOffset(model, {email: ['a', 'b']});
    expect(lastQuery(model).findOptions.where.email[Op.in]).toEqual(['a', 'b']);
  });

  it('combines several conditions under a conjunction', async () => {
    const model = userLike();
    await paginateByOffset(model, {email: 'a'}, {where: {disabledAt: null}});
    expect(lastQuery(model).findOptions.where[Op.and]).toEqual([
      {email: 'a'},
      {disabledAt: null},
    ]);
  });

  it('hands a rule the include list so it can join', async () => {
    const model = userLike();
    await paginateByOffset(
      model,
      {email: 'a'},
      {
        filters: {
          email: (value, {include}) => {
            include.push({association: 'roles'});
            return {email: value};
          },
        },
      },
    );
    expect(lastQuery(model).findOptions.include).toEqual([
      {association: 'roles'},
    ]);
  });
});

describe('ordering', () => {
  it('always appends a deterministic tiebreak', async () => {
    const model = userLike();
    await paginateByOffset(model, {});
    expect(lastQuery(model).findOptions.order).toEqual([['id', 'DESC']]);
  });

  it('reads the leading minus as descending', async () => {
    const model = userLike();
    await paginateByOffset(model, {sort: ['-email']});
    expect(lastQuery(model).findOptions.order[0]).toEqual(['email', 'DESC']);
  });

  it('spells the null position for a nullable key, since the index must match', async () => {
    const ascending = userLike();
    await paginateByOffset(ascending, {sort: ['disabledAt']});
    expect(lastQuery(ascending).findOptions.order[0]).toEqual([
      'disabledAt',
      'ASC NULLS FIRST',
    ]);

    const descending = userLike();
    await paginateByOffset(descending, {sort: ['-disabledAt']});
    expect(lastQuery(descending).findOptions.order[0]).toEqual([
      'disabledAt',
      'DESC NULLS LAST',
    ]);
  });

  it('leaves a non-null key without a null clause', async () => {
    const model = userLike();
    await paginateByOffset(model, {sort: ['email']});
    expect(lastQuery(model).findOptions.order[0]).toEqual(['email', 'ASC']);
  });

  it('keeps the first direction when a field is requested twice', async () => {
    const model = userLike();
    await paginateByOffset(model, {sort: ['email', '-email']});
    const order = lastQuery(model).findOptions.order;
    expect(order.filter(entry => entry[0] === 'email')).toEqual([
      ['email', 'ASC'],
    ]);
  });

  it('places the caller fallback after the request and before the tiebreak', async () => {
    const model = userLike();
    await paginateByOffset(
      model,
      {sort: ['email']},
      {
        order: [['disabledAt', 'DESC']],
      },
    );
    expect(lastQuery(model).findOptions.order).toEqual([
      ['email', 'ASC'],
      ['disabledAt', 'DESC'],
      ['id', 'DESC'],
    ]);
  });

  it('resolves a dotted sort key through the association', async () => {
    const model = userLike({
      associations: {
        roles: {target: {getAttributes: () => ({label: {allowNull: false}})}},
      },
    });
    await paginateByOffset(model, {sort: ['roles.label']});
    expect(lastQuery(model).findOptions.order[0]).toEqual([
      'roles',
      'label',
      'ASC',
    ]);
  });
});
