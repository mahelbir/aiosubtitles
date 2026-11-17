import pino from 'pino';
import {describe, expect, it} from 'vitest';
import {runCliScript} from '../helpers/cli.js';

const SEED_MOCK_URL = new URL(
  '../../src/db/cli/seed-mock.dev.js',
  import.meta.url,
);

describe('mock data seeder', () => {
  it('refuses to run in production, before it connects', async () => {
    const {exitCode, messages} = await runCliScript(SEED_MOCK_URL, {
      env: {NODE_ENV: 'production'},
    });

    expect(exitCode).toBe(1);
    expect(messages).toEqual(['Mock data is never seeded in production']);
  });

  it('seeds outside production without a warning', async () => {
    const {exitCode, logs} = await runCliScript(SEED_MOCK_URL);

    expect(exitCode).toBe(0);
    expect(logs.filter(({level}) => level >= pino.levels.values.warn)).toEqual(
      [],
    );
  });
});
