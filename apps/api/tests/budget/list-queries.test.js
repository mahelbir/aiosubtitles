import {describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {generateRefreshToken} from '../../src/lib/auth/token.js';
import {getTestApp} from '../helpers/app.js';
import {recordQueries, recordRedisCommands} from '../helpers/counters.js';
import {
  authHeaders,
  createRole,
  createUser,
  getSeededAdminUser,
  toEmail,
} from '../helpers/factories.js';

async function seedUsers(from, to, role) {
  for (let index = from; index < to; index += 1) {
    await createUser({
      email: toEmail(`bulk-${index}`),
      roles: role ? [role] : [],
    });
  }
}

async function warmAndCount(app, request) {
  await app.inject(request);
  return recordQueries(async () => {
    const response = await app.inject(request);
    expect(response.statusCode).toBe(StatusCodes.OK);
  });
}

describe('list endpoints do not scale their queries with their rows', () => {
  it('costs the same for two users as for twenty', async () => {
    const app = await getTestApp();
    const headers = await authHeaders(await getSeededAdminUser());
    const role = await createRole({slug: 'bulk-role', position: 500});
    const request = {method: 'GET', url: '/users?pageSize=100', headers};

    await seedUsers(0, 2, role);
    const small = await warmAndCount(app, request);

    await seedUsers(2, 20, role);
    const large = await warmAndCount(app, request);

    expect(large.length).toBe(small.length);
  });

  it('costs the same for two roles as for twenty', async () => {
    const app = await getTestApp();
    const headers = await authHeaders(await getSeededAdminUser());
    const request = {method: 'GET', url: '/roles?pageSize=100', headers};

    for (const index of [1, 2]) {
      await createRole({slug: `small-${index}`, position: index * 100});
    }
    const small = await warmAndCount(app, request);

    for (const index of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      await createRole({slug: `large-${index}`, position: index * 100});
    }
    const large = await warmAndCount(app, request);

    expect(large.length).toBe(small.length);
  });

  it('does not grow with the number of roles a user holds', async () => {
    const app = await getTestApp();
    const headers = await authHeaders(await getSeededAdminUser());
    const request = {method: 'GET', url: '/users?pageSize=100', headers};

    const roles = [];
    for (const index of [1, 2, 3, 4, 5]) {
      roles.push(
        await createRole({slug: `many-${index}`, position: index * 50}),
      );
    }
    await createUser({email: toEmail('one-role'), roles: roles.slice(0, 1)});
    const few = await warmAndCount(app, request);

    await createUser({email: toEmail('five-roles'), roles});
    const many = await warmAndCount(app, request);

    expect(many.length).toBe(few.length);
  });
});

describe('the authenticated path stays cheap', () => {
  it('costs no database read once the caches are warm', async () => {
    const app = await getTestApp();
    const headers = await authHeaders(await getSeededAdminUser());
    const request = {method: 'GET', url: '/auth/me', headers};

    await app.inject(request);
    await app.inject(request);
    const statements = await warmAndCount(app, request);

    expect(statements).toEqual([]);
  });

  it('costs no database read to mint a fresh access token', async () => {
    const app = await getTestApp();
    const {token} = await generateRefreshToken((await getSeededAdminUser()).id);
    const request = {
      method: 'POST',
      url: '/auth/refresh',
      payload: {refreshToken: token},
    };

    await app.inject(request);
    await app.inject(request);
    const statements = await warmAndCount(app, request);

    expect(statements).toEqual([]);
  });

  it('consults Redis a bounded number of times per authenticated request', async () => {
    const app = await getTestApp();
    const headers = await authHeaders(await getSeededAdminUser());
    const request = {method: 'GET', url: '/auth/me', headers};

    await app.inject(request);
    await app.inject(request);
    const commands = await recordRedisCommands(() => app.inject(request));

    expect(commands.length).toBeLessThanOrEqual(4);
  });
});
