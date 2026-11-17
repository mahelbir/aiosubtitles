import {describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {getTestApp} from '../helpers/app.js';
import {User} from '../../src/db/models/user.js';
import {userCache} from '../../src/lib/user-cache.js';
import {findForbiddenKeys, readEnvelope} from '../helpers/assertions.js';
import {
  authHeaders,
  createRole,
  createUser,
  getSeededAdminUser,
  toEmail,
} from '../helpers/factories.js';

const FORBIDDEN = [...User.sensitiveAttributes];

async function adminHeaders() {
  return authHeaders(await getSeededAdminUser());
}

describe('sensitive attributes', () => {
  it('never cross the wire on any read endpoint', async () => {
    const app = await getTestApp();
    const role = await createRole({position: 500, permissions: []});
    const subject = await createUser({
      email: toEmail('visible'),
      roles: [role],
    });
    const headers = await adminHeaders();

    const urls = [
      '/auth/me',
      '/users',
      `/users/${subject.id}`,
      '/users/me',
      '/roles',
      `/roles/${role.id}`,
      '/roles/options',
      '/settings',
    ];

    const leaks = [];
    for (const url of urls) {
      const response = await app.inject({method: 'GET', url, headers});
      expect(response.statusCode).toBe(StatusCodes.OK);
      const found = findForbiddenKeys(readEnvelope(response), FORBIDDEN);
      leaks.push(...found.map(path => `${url} ${path}`));
    }
    expect(leaks).toEqual([]);
  });

  it('is not merely absent from the payload but absent from the body text', async () => {
    const app = await getTestApp();
    const subject = await createUser({email: toEmail('hash-check')});
    const response = await app.inject({
      method: 'GET',
      url: `/users/${subject.id}`,
      headers: await adminHeaders(),
    });
    expect(response.body).not.toContain('$2');
  });

  it('never reach the cache, so the hash lives in the database alone', async () => {
    const subject = await createUser({email: toEmail('cached-hash')});
    const cached = await userCache.get(subject.id);
    expect(findForbiddenKeys(cached, FORBIDDEN)).toEqual([]);
    expect(JSON.stringify(cached)).not.toContain('$2');
  });

  it('does not leak through a search that matches on the hidden column', async () => {
    const app = await getTestApp();
    await createUser({email: toEmail('searchable')});
    const response = await app.inject({
      method: 'GET',
      url: '/users?search=searchable',
      headers: await adminHeaders(),
    });
    expect(findForbiddenKeys(readEnvelope(response), FORBIDDEN)).toEqual([]);
  });

  it('ships a viewer decision per row so the client never re-derives policy', async () => {
    const app = await getTestApp();
    await createUser({email: toEmail('row-check')});
    const response = await app.inject({
      method: 'GET',
      url: '/users',
      headers: await adminHeaders(),
    });
    const {items} = readEnvelope(response).data;
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.viewerCan).toEqual({
        update: expect.any(Boolean),
        delete: expect.any(Boolean),
      });
    }
  });
});
