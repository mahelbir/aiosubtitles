import pino from 'pino';
import {describe, expect, it} from 'vitest';
import {loggerOptions} from '../../src/lib/logger.js';

const SEALED_SECRET = 'sealed-credential-ciphertext';
const PASSWORD_HASH = '$2b$12$keyed-bcrypt-hash';

function makeDatabaseError() {
  const parent = Object.assign(new Error('deadlock detected'), {
    sql: 'UPDATE user_configs SET password_hash = $1',
    parameters: [PASSWORD_HASH],
  });
  return Object.assign(new Error('Database failure.'), {
    name: 'SequelizeDatabaseError',
    sql: 'INSERT INTO user_config_credentials VALUES ($1)',
    parameters: [SEALED_SECRET],
    parent,
    original: parent,
  });
}

function logError(error) {
  const logLines = [];
  const logger = pino(
    {...loggerOptions, level: 'error'},
    {write: logLine => logLines.push(logLine)},
  );
  logger.error(error);
  return {logText: logLines.join(''), logEntry: JSON.parse(logLines[0])};
}

describe('the logger error serializer', () => {
  it('drops the statement and its bound values from a database error', () => {
    const {logText, logEntry} = logError(makeDatabaseError());

    expect(logText).not.toContain(SEALED_SECRET);
    expect(logText).not.toContain(PASSWORD_HASH);
    expect(logText).not.toContain('INSERT INTO');
    expect(logEntry.err).not.toHaveProperty('sql');
    expect(logEntry.err).not.toHaveProperty('parameters');
    expect(logEntry.err).not.toHaveProperty('parent');
    expect(logEntry.err).not.toHaveProperty('original');
    expect(logEntry.err).toMatchObject({
      type: 'Error',
      message: 'Database failure.',
    });
  });

  it('logs a value that is no error as it is', () => {
    const logLines = [];
    const logger = pino(
      {...loggerOptions, level: 'error'},
      {write: logLine => logLines.push(logLine)},
    );

    logger.error({err: 'plain text'}, 'Odd failure.');

    expect(JSON.parse(logLines[0]).err).toBe('plain text');
  });

  it('drops them from every error an aggregate carries', () => {
    const {logText} = logError(
      new AggregateError([makeDatabaseError()], 'Several failures.'),
    );

    expect(logText).not.toContain(SEALED_SECRET);
    expect(logText).not.toContain(PASSWORD_HASH);
  });
});
