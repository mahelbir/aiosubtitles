import {readFileSync} from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {pick} from 'es-toolkit';
import {getMainCheckoutPath} from '@repo/tooling/git.js';

const SECRETS_FILE_NAME = '.secrets.local.env';
const MISSING_FILE_CODE = 'ENOENT';

export const LIVE_SECRET_NAMES = Object.freeze([
  'OPENSUBTITLES_API_KEY',
  'OPENSUBTITLES_USERNAME',
  'OPENSUBTITLES_PASSWORD',
  'SUBSOURCE_API_KEY',
  'SUBDL_API_KEY',
  'WYZIE_API_KEY',
  'ALTYAZIDB_API_KEY',
  'BETASERIES_API_KEY',
  'THESUBTITLEDB_API_KEY',
  'ANISUB_ACCESS_TOKEN',
]);

export function getLiveSecretsPath() {
  return path.join(getMainCheckoutPath(import.meta.dirname), SECRETS_FILE_NAME);
}

function readSecretsText(secretsPath) {
  try {
    return readFileSync(secretsPath, 'utf8');
  } catch (error) {
    if (error.code === MISSING_FILE_CODE) {
      return null;
    }
    throw error;
  }
}

function parseSecretsText(secretsText) {
  try {
    return parseEnv(secretsText);
  } catch {
    throw new SyntaxError('The live secrets file cannot be parsed.');
  }
}

export function loadLiveSecrets({secretsPath = getLiveSecretsPath()} = {}) {
  const secretsText = readSecretsText(secretsPath);
  if (secretsText === null) {
    return Object.freeze({});
  }
  return Object.freeze(pick(parseSecretsText(secretsText), LIVE_SECRET_NAMES));
}
