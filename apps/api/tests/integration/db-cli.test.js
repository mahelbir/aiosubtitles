import pino from 'pino';
import {describe, expect, it} from 'vitest';
import {
  DB_CLI_FIXTURE_CLEANUP_LOG,
  DB_CLI_FIXTURE_FAILING_CACHE,
  DB_CLI_FIXTURE_FAILING_TASK,
  DB_CLI_FIXTURE_TASK_LOG,
  DB_CLI_FIXTURE_URL,
  DB_CLI_FIXTURE_WITHOUT_CLEANUP,
  getClosedPort,
  LOOPBACK,
  runCliScript,
} from '../helpers/cli.js';

const {error: ERROR_LEVEL, warn: WARN_LEVEL} = pino.levels.values;

describe('database CLI runner', () => {
  it('connects, runs the task and cleans up', async () => {
    const {exitCode, logs, messages} = await runCliScript(DB_CLI_FIXTURE_URL);

    expect(exitCode).toBe(0);
    expect(logs).toContainEqual(
      expect.objectContaining({
        msg: 'Connecting to database...',
        dialect: 'postgres',
        database: process.env.DB_NAME,
      }),
    );
    expect(messages).toContain(DB_CLI_FIXTURE_TASK_LOG);
    expect(messages).toContain(DB_CLI_FIXTURE_CLEANUP_LOG);
  });

  it('runs a command that has nothing to clean up', async () => {
    const {exitCode, messages} = await runCliScript(DB_CLI_FIXTURE_URL, {
      args: [DB_CLI_FIXTURE_WITHOUT_CLEANUP],
    });

    expect(exitCode).toBe(0);
    expect(messages).toContain(DB_CLI_FIXTURE_TASK_LOG);
    expect(messages).not.toContain(DB_CLI_FIXTURE_CLEANUP_LOG);
  });

  it('fails the command when the task throws, and still cleans up', async () => {
    const {exitCode, logs, messages} = await runCliScript(DB_CLI_FIXTURE_URL, {
      args: [DB_CLI_FIXTURE_FAILING_TASK],
    });

    expect(exitCode).toBe(1);
    expect(logs).toContainEqual(
      expect.objectContaining({
        msg: 'Command failed',
        level: ERROR_LEVEL,
        err: expect.objectContaining({message: 'Fixture failing-task failed.'}),
      }),
    );
    expect(messages).toContain(DB_CLI_FIXTURE_CLEANUP_LOG);
  });

  it('tells an unreachable database apart from a failing command', async () => {
    const {exitCode, logs, messages} = await runCliScript(DB_CLI_FIXTURE_URL, {
      env: {DB_HOST: LOOPBACK, DB_PORT: await getClosedPort()},
    });

    expect(exitCode).toBe(1);
    expect(logs).toContainEqual(
      expect.objectContaining({
        msg: 'Database connection failed',
        level: ERROR_LEVEL,
        err: expect.any(Object),
      }),
    );
    expect(messages).not.toContain('Command failed');
    expect(messages).not.toContain(DB_CLI_FIXTURE_TASK_LOG);
    expect(messages).toContain(DB_CLI_FIXTURE_CLEANUP_LOG);
  });

  it('warns instead of failing when a cache cannot be dropped', async () => {
    const {exitCode, logs} = await runCliScript(DB_CLI_FIXTURE_URL, {
      args: [DB_CLI_FIXTURE_FAILING_CACHE],
    });

    expect(exitCode).toBe(0);
    expect(logs).toContainEqual(
      expect.objectContaining({
        msg: 'Redis unreachable, cache not dropped',
        level: WARN_LEVEL,
        err: expect.objectContaining({
          message: 'Fixture failing-cache failed.',
        }),
      }),
    );
  });
});
