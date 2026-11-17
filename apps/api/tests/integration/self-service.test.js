import {beforeEach, describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {Permission} from '@repo/shared/constants/permission.js';
import {getTestApp} from '../helpers/app.js';
import {readEnvelope} from '../helpers/assertions.js';
import {
  DEFAULT_PASSWORD,
  authHeaders,
  createRole,
  createUser,
  toEmail,
} from '../helpers/factories.js';

const PASSWORD_CHANGE_ATTEMPTS = 5;

let member;
let headers;

beforeEach(async () => {
  const role = await createRole({
    slug: 'member',
    position: 2000,
    permissions: [Permission.ADMIN],
  });
  member = await createUser({email: toEmail('member'), roles: [role]});
  headers = await authHeaders(member);
});

describe('profile', () => {
  it('reads back the account behind the token', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers,
    });
    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(readEnvelope(response).data).toEqual({
      id: member.id,
      email: toEmail('member'),
    });
  });

  it('renames the account and reflects it on the next read', async () => {
    const app = await getTestApp();
    const updated = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      headers,
      payload: {email: toEmail('renamed-member')},
    });
    expect(updated.statusCode).toBe(StatusCodes.OK);

    const reread = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers,
    });
    expect(readEnvelope(reread).data.email).toBe(toEmail('renamed-member'));
  });

  it('answers an empty change without writing anything', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      headers,
      payload: {},
    });
    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(readEnvelope(response).message).toContain('Değişiklik yok');
  });

  it('refuses an email another account already holds', async () => {
    const app = await getTestApp();
    await createUser({email: toEmail('taken')});
    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      headers,
      payload: {email: toEmail('taken')},
    });
    expect(response.statusCode).toBe(StatusCodes.CONFLICT);
  });
});

describe('password', () => {
  it('changes the password when the current one is given', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/password',
      headers,
      payload: {currentPassword: DEFAULT_PASSWORD, password: 'a-new-secret'},
    });
    expect(response.statusCode).toBe(StatusCodes.OK);

    const relogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {email: toEmail('member'), password: 'a-new-secret'},
    });
    expect(relogin.statusCode).toBe(StatusCodes.OK);
  });

  it('refuses further attempts once the account spends its window', async () => {
    const app = await getTestApp();
    const attempt = () =>
      app.inject({
        method: 'PATCH',
        url: '/users/me/password',
        headers,
        payload: {currentPassword: 'not-it', password: 'a-new-secret'},
      });
    for (let i = 0; i < PASSWORD_CHANGE_ATTEMPTS; i++) {
      expect((await attempt()).statusCode).toBe(StatusCodes.FORBIDDEN);
    }
    expect((await attempt()).statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS);
  });

  it('refuses when the current password is wrong, and leaves it unchanged', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/password',
      headers,
      payload: {currentPassword: 'not-it', password: 'a-new-secret'},
    });
    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN);

    const relogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {email: toEmail('member'), password: DEFAULT_PASSWORD},
    });
    expect(relogin.statusCode).toBe(StatusCodes.OK);
  });

  it('refuses a replacement below the length floor', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/password',
      headers,
      payload: {currentPassword: DEFAULT_PASSWORD, password: 'short'},
    });
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});

describe('the permission boundary', () => {
  it('closes self-service to an account without the management permission', async () => {
    const app = await getTestApp();
    const outsider = await createUser({email: toEmail('outsider')});
    const outsiderHeaders = await authHeaders(outsider);

    for (const url of ['/users/me', '/users/me/password']) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: outsiderHeaders,
      });
      expect(response.statusCode).not.toBe(StatusCodes.OK);
    }
  });

  it('leaves the session endpoints open to any authenticated account', async () => {
    const app = await getTestApp();
    const outsider = await createUser({email: toEmail('outsider')});
    const outsiderHeaders = await authHeaders(outsider);

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: outsiderHeaders,
    });
    expect(me.statusCode).toBe(StatusCodes.OK);
    expect(readEnvelope(me).data.permissions).toEqual([]);

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: outsiderHeaders,
    });
    expect(logout.statusCode).toBe(StatusCodes.OK);
  });
});
