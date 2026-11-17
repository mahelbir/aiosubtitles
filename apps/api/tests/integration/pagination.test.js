import {beforeEach, describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {getTestApp} from '../helpers/app.js';
import {readEnvelope} from '../helpers/assertions.js';
import {
  createFixtureRecord,
  createFixtureTag,
  toEmail,
} from '../helpers/factories.js';
import {PAGINATION_FIXTURE_URL} from '../helpers/fixtures.js';

let editorTag;
let reviewerTag;

beforeEach(async () => {
  [editorTag, reviewerTag] = await Promise.all([
    createFixtureTag({label: 'editor', rank: 500}),
    createFixtureTag({label: 'reviewer', rank: 400}),
  ]);
  await createFixtureRecord({name: toEmail('admin')});
  await createFixtureRecord({
    name: toEmail('alpha'),
    tags: [editorTag, reviewerTag],
  });
  await createFixtureRecord({name: toEmail('beta')});
  await createFixtureRecord({name: toEmail('gamma'), disabledAt: new Date()});
});

const list = async (app, query = '') => {
  const response = await app.inject({
    method: 'GET',
    url: `${PAGINATION_FIXTURE_URL}${query}`,
  });
  expect(response.statusCode).toBe(StatusCodes.OK);
  return readEnvelope(response).data;
};

describe('paging', () => {
  it('reports the totals and the range the page covers', async () => {
    const app = await getTestApp();
    const page = await list(app, '?pageSize=2&pageNumber=1');
    expect(page.items).toHaveLength(2);
    expect(page.meta).toMatchObject({
      pageNumber: 1,
      pageSize: 2,
      totalItemCount: 4,
      totalPageCount: 2,
      rangeStart: 1,
      rangeEnd: 2,
    });
  });

  it('links forward and back without inventing pages', async () => {
    const app = await getTestApp();
    const first = await list(app, '?pageSize=2&pageNumber=1');
    expect(first.links).toMatchObject({previous: null, next: 2, last: 2});
    const last = await list(app, '?pageSize=2&pageNumber=2');
    expect(last.links).toMatchObject({previous: 1, next: null});
  });

  it('emits a page window only when one is requested', async () => {
    const app = await getTestApp();
    expect((await list(app, '?pageSize=1')).links.window).toBeUndefined();
    expect((await list(app, '?pageSize=1&windowSize=3')).links.window).toEqual([
      1, 2, 3,
    ]);
  });

  it('refuses a page size beyond the cap rather than clamping silently', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `${PAGINATION_FIXTURE_URL}?pageSize=1000`,
    });
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});

describe('filters', () => {
  it('ignores a query key no rule covers and the model does not own', async () => {
    const app = await getTestApp();
    const all = await list(app);
    const junk = await list(app, '?secret=whatever&nonsense=1');
    expect(junk.meta.totalItemCount).toBe(all.meta.totalItemCount);
  });

  it('does not let a wildcard in the search term widen the match', async () => {
    const app = await getTestApp();
    /* Unescaped, "%%" would match every row and "_a" would match "alpha". */
    expect((await list(app, '?search=%25%25')).items).toHaveLength(0);
    expect((await list(app, '?search=_a')).items).toHaveLength(0);
  });

  it('splits on the disabled state, and drops the filter when both are asked for', async () => {
    const app = await getTestApp();
    expect((await list(app, '?disabled=true')).items.map(i => i.name)).toEqual([
      toEmail('gamma'),
    ]);
    expect(
      (await list(app, '?disabled=false')).items.map(i => i.name).toSorted(),
    ).toEqual([toEmail('admin'), toEmail('alpha'), toEmail('beta')]);
    expect(
      (await list(app, '?disabled=true&disabled=false')).meta.totalItemCount,
    ).toBe(4);
  });

  it('filters through a relation without duplicating a row per match', async () => {
    const app = await getTestApp();
    const found = await list(
      app,
      `?tagId=${editorTag.id}&tagId=${reviewerTag.id}`,
    );
    expect(found.items.map(item => item.name)).toEqual([toEmail('alpha')]);
    expect(found.meta.totalItemCount).toBe(1);
  });

  it('narrows the page to the requested ids', async () => {
    const app = await getTestApp();
    const everyone = await list(app);
    const byName = Object.fromEntries(
      everyone.items.map(item => [item.name, item.id]),
    );
    const a = byName[toEmail('alpha')];
    const b = byName[toEmail('gamma')];
    const found = await list(app, `?id=${a}&id=${b}`);
    expect(new Set(found.items.map(item => item.id))).toEqual(new Set([a, b]));
    expect(found.meta.totalItemCount).toBe(2);
  });

  it('refuses a malformed id', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `${PAGINATION_FIXTURE_URL}?id=5`,
    });
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  it('refuses a filter value its field does not accept', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `${PAGINATION_FIXTURE_URL}?tagId=not-a-uuid`,
    });
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});

describe('sorting', () => {
  it('orders by a declared field in both directions', async () => {
    const app = await getTestApp();
    const ascending = await list(app, '?sort=name');
    const descending = await list(app, '?sort=-name');
    expect(ascending.items.map(item => item.name)).toEqual([
      toEmail('admin'),
      toEmail('alpha'),
      toEmail('beta'),
      toEmail('gamma'),
    ]);
    expect(descending.items.map(item => item.name)).toEqual([
      toEmail('gamma'),
      toEmail('beta'),
      toEmail('alpha'),
      toEmail('admin'),
    ]);
  });

  it('refuses a sort field the endpoint does not expose', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `${PAGINATION_FIXTURE_URL}?sort=secret`,
    });
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  it('places nulls consistently when sorting a nullable column', async () => {
    const app = await getTestApp();
    const ascending = await list(app, '?sort=disabledAt');
    expect(ascending.items.at(-1).name).toBe(toEmail('gamma'));
    const descending = await list(app, '?sort=-disabledAt');
    expect(descending.items[0].name).toBe(toEmail('gamma'));
  });
});
