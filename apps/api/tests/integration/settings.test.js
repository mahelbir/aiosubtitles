import * as fs from 'node:fs/promises';
import {beforeEach, describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {getTestApp} from '../helpers/app.js';
import {readEnvelope} from '../helpers/assertions.js';
import {authHeaders, getSeededAdminUser} from '../helpers/factories.js';
import {SETTINGS_FIXTURE_URL} from '../helpers/fixtures.js';
import {
  FIXTURE_SETTINGS_FILE,
  fixtureSettings,
  seedSettings,
  writeSettingsFile,
} from '../helpers/settings.js';

const UNPARSABLE = '{"label": "kept", "limit": ';
const BROKEN_FILES = [
  ['a field', {limit: -1}],
  ['a rule', {isEnabled: true, limit: 0}],
  ['a rule inside a group', {notice: {isShown: true}}],
];

let headers;

beforeEach(async () => {
  [headers] = await Promise.all([
    getSeededAdminUser().then(authHeaders),
    seedSettings({}),
  ]);
});

const read = async app => {
  const response = await app.inject({
    method: 'GET',
    url: SETTINGS_FIXTURE_URL,
    headers,
  });
  expect(response.statusCode).toBe(StatusCodes.OK);
  return readEnvelope(response).data;
};

const write = (app, payload) =>
  app.inject({method: 'PATCH', url: SETTINGS_FIXTURE_URL, headers, payload});

describe('reading', () => {
  it('answers a fully populated shape even from a bare file', async () => {
    const app = await getTestApp();
    expect(await read(app)).toEqual({
      label: '',
      limit: 0,
      isEnabled: false,
      notice: {title: '', isShown: false},
      revision: 0,
    });
  });

  it('reads the stored values through the schema', async () => {
    const app = await getTestApp();
    await seedSettings({limit: '4', revision: '3'});
    expect(await read(app)).toMatchObject({limit: 4, revision: 3});
  });

  it.each(BROKEN_FILES)(
    'keeps serving the last good values once the file breaks %s',
    async (_, broken) => {
      const app = await getTestApp();
      await seedSettings({label: 'kept'});
      await writeSettingsFile(broken);

      await expect(fixtureSettings.reload()).rejects.toThrow();

      expect((await read(app)).label).toBe('kept');
    },
  );
});

describe('writing', () => {
  it('applies a change and answers the settings it stored', async () => {
    const app = await getTestApp();
    const response = await write(app, {limit: 7});
    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(readEnvelope(response).data).toEqual(await read(app));
    expect((await read(app)).limit).toBe(7);
  });

  it('serves the new value as soon as the write returns', async () => {
    const app = await getTestApp();
    await seedSettings({limit: 20});
    await write(app, {limit: 25});
    expect((await read(app)).limit).toBe(25);
  });

  it('coerces the string forms a form submission carries', async () => {
    const app = await getTestApp();
    await write(app, {isEnabled: 'true', limit: '3'});
    expect(await read(app)).toMatchObject({isEnabled: true, limit: 3});
  });

  it('leaves untouched keys alone', async () => {
    const app = await getTestApp();
    await write(app, {label: 'kept'});
    await write(app, {limit: 2});
    expect(await read(app)).toMatchObject({label: 'kept', limit: 2});
  });

  it('merges a nested change into the values beside it', async () => {
    const app = await getTestApp();
    await write(app, {notice: {title: 'old', isShown: true}});

    const response = await write(app, {notice: {title: 'new'}});

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(readEnvelope(response).data.notice).toEqual({
      title: 'new',
      isShown: true,
    });
  });

  it('refuses a nested key the schema does not declare', async () => {
    const app = await getTestApp();
    const response = await write(app, {notice: {titel: 'x'}});
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  it('names the nested field a refused value belongs to', async () => {
    const app = await getTestApp();
    const response = await write(app, {notice: {isShown: 'maybe'}});
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(readEnvelope(response).data.errors[0].field).toBe('notice.isShown');
  });

  it('refuses an empty change rather than reporting success', async () => {
    const app = await getTestApp();
    const response = await write(app, {});
    expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST);
    expect(readEnvelope(response).message).toContain('Hiçbir ayar');
  });

  it('refuses a change made of empty groups alone', async () => {
    const app = await getTestApp();
    const response = await write(app, {notice: {}});
    expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST);
    expect(readEnvelope(response).message).toContain('Hiçbir ayar');
  });

  it('refuses a key the schema does not declare', async () => {
    const app = await getTestApp();
    const response = await write(app, {limt: 1});
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  it('refuses a key only the server writes', async () => {
    const app = await getTestApp();
    const response = await write(app, {revision: 1});
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect((await read(app)).revision).toBe(0);
  });

  it('refuses a value the schema cannot read', async () => {
    const app = await getTestApp();
    const response = await write(app, {limit: 'many'});
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  it.each(BROKEN_FILES)(
    'fails rather than write over a file that breaks %s',
    async (_, broken) => {
      const app = await getTestApp();
      await writeSettingsFile(broken);

      const response = await write(app, {label: 'blocked'});

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
      expect(
        JSON.parse(await fs.readFile(FIXTURE_SETTINGS_FILE, 'utf8')),
      ).toEqual(broken);
    },
  );

  it('fails rather than write over a file it cannot parse', async () => {
    const app = await getTestApp();
    await seedSettings({label: 'kept', limit: 4});
    await fs.writeFile(FIXTURE_SETTINGS_FILE, UNPARSABLE);

    const response = await write(app, {label: 'blocked'});

    expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(await fs.readFile(FIXTURE_SETTINGS_FILE, 'utf8')).toBe(UNPARSABLE);
  });
});

describe('cross-field rules', () => {
  it('checks a change against the values already stored', async () => {
    const app = await getTestApp();
    const response = await write(app, {isEnabled: true});
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(readEnvelope(response).data.errors[0].field).toBe('limit');
    expect((await read(app)).isEnabled).toBe(false);
  });

  it('accepts a change that brings what the rule needs', async () => {
    const app = await getTestApp();
    const response = await write(app, {isEnabled: true, limit: 2});
    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(await read(app)).toMatchObject({isEnabled: true, limit: 2});
  });

  it('names the nested field a rule inside a group refuses', async () => {
    const app = await getTestApp();
    const response = await write(app, {notice: {isShown: true}});
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(readEnvelope(response).data.errors[0].field).toBe('notice.title');
    expect((await read(app)).notice.isShown).toBe(false);
  });
});
