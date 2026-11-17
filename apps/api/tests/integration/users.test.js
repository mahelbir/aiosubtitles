import {beforeEach, describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {getTestApp} from '../helpers/app.js';
import {readEnvelope} from '../helpers/assertions.js';
import {
  authHeaders,
  createRole,
  createUser,
  getSeededAdminUser,
  toEmail,
} from '../helpers/factories.js';

let headers;
let editorRole;

beforeEach(async () => {
  headers = await authHeaders(await getSeededAdminUser());
  editorRole = await createRole({slug: 'editor', position: 500});
  await createUser({email: toEmail('alpha'), roles: [editorRole]});
  await createUser({email: toEmail('beta')});
  await createUser({email: toEmail('gamma'), disabledAt: new Date()});
});

const list = async (app, query = '') => {
  const response = await app.inject({
    method: 'GET',
    url: `/users${query}`,
    headers,
  });
  expect(response.statusCode).toBe(StatusCodes.OK);
  return readEnvelope(response).data;
};

describe('the user list', () => {
  it('matches an email fragment case-insensitively', async () => {
    const app = await getTestApp();
    const found = await list(app, '?search=ALP');
    expect(found.items.map(item => item.email)).toEqual([toEmail('alpha')]);
  });

  it.each(['IBRAHIM', 'İBRAHİM'])(
    'finds an email searched in capitals, dotted or not (%s)',
    async term => {
      const app = await getTestApp();
      await createUser({email: toEmail('ibrahim')});
      const found = await list(app, `?search=${encodeURIComponent(term)}`);
      expect(found.items.map(item => item.email)).toEqual([toEmail('ibrahim')]);
    },
  );

  it('treats a uuid search as an identity lookup', async () => {
    const app = await getTestApp();
    const [target] = (await list(app, '?search=beta')).items;
    const found = await list(app, `?search=${target.id}`);
    expect(found.items.map(item => item.id)).toEqual([target.id]);
  });

  it('splits on the disabled state', async () => {
    const app = await getTestApp();
    expect((await list(app, '?disabled=true')).items.map(i => i.email)).toEqual(
      [toEmail('gamma')],
    );
    expect(
      (await list(app, '?disabled=false')).items.map(i => i.email).toSorted(),
    ).toEqual([toEmail('admin'), toEmail('alpha'), toEmail('beta')]);
  });

  it('filters by role', async () => {
    const app = await getTestApp();
    const found = await list(app, `?roleId=${editorRole.id}`);
    expect(found.items.map(item => item.email)).toEqual([toEmail('alpha')]);
    expect(found.meta.totalItemCount).toBe(1);
  });

  it('refuses a role filter that is not a uuid', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/users?roleId=not-a-uuid',
      headers,
    });
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});
