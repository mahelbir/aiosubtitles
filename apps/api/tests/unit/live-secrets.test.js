import {mkdtempSync, readFileSync, rmSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {inspect, parseEnv} from 'node:util';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {getWorkspacePath} from '@repo/tooling/workspace.js';
import {
  LIVE_SECRET_NAMES,
  getLiveSecretsPath,
  loadLiveSecrets,
} from '../../scripts/lib/live-secrets.js';
import {catchError, toErrorText} from '../helpers/caught-error.js';

vi.mock(import('node:util'), async importOriginal => {
  const nodeUtil = await importOriginal();
  return {...nodeUtil, parseEnv: vi.fn(nodeUtil.parseEnv)};
});

const SAMPLE_SECRETS_PATH = path.join(
  import.meta.dirname,
  '..',
  'fixtures',
  'live-secrets',
  'sample.env',
);
const SECRETS_FILE_NAME = '.secrets.local.env';
const WORKTREE_GITDIR_PATTERN =
  /^gitdir:\s*(.+?)[\\/]\.git[\\/]worktrees[\\/]/m;
const EXPECTED_SECRET_NAMES = [
  'OPENSUBTITLES_API_KEY',
  'OPENSUBTITLES_USERNAME',
  'OPENSUBTITLES_PASSWORD',
  'SUBSOURCE_API_KEY',
  'SUBDL_API_KEY',
  'WYZIE_API_KEY',
  'ALTYAZIDB_API_KEY',
  'BETASERIES_API_KEY',
];
const FIXTURE_SECRETS = {
  OPENSUBTITLES_API_KEY: 'fake-opensubtitles-api-key',
  OPENSUBTITLES_USERNAME: 'fake-opensubtitles-username',
  OPENSUBTITLES_PASSWORD: 'fake-opensubtitles-password',
  SUBSOURCE_API_KEY: 'fake-subsource-api-key',
  SUBDL_API_KEY: 'fake-subdl-api-key',
  WYZIE_API_KEY: 'fake-wyzie-api-key',
  ALTYAZIDB_API_KEY: 'fake-altyazidb-api-key',
  BETASERIES_API_KEY: 'fake-betaseries-api-key',
};
const FIXTURE_VALUES = [
  ...Object.values(FIXTURE_SECRETS),
  'fake-unlisted-fixture-token',
];

function findMainCheckoutPath() {
  const workspacePath = getWorkspacePath();
  const gitPath = path.join(workspacePath, '.git');
  if (statSync(gitPath).isDirectory()) {
    return workspacePath;
  }
  return readFileSync(gitPath, 'utf8').match(WORKTREE_GITDIR_PATTERN)[1];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LIVE_SECRET_NAMES', () => {
  it('lists exactly the eight live secret names', () => {
    expect(LIVE_SECRET_NAMES.toSorted()).toEqual(
      EXPECTED_SECRET_NAMES.toSorted(),
    );
  });
});

describe('loadLiveSecrets', () => {
  it('returns only the listed names with their values', () => {
    expect(loadLiveSecrets({secretsPath: SAMPLE_SECRETS_PATH})).toEqual(
      FIXTURE_SECRETS,
    );
  });

  it('drops a key the list does not name', () => {
    const liveSecrets = loadLiveSecrets({secretsPath: SAMPLE_SECRETS_PATH});
    expect(Object.hasOwn(liveSecrets, 'UNLISTED_FIXTURE_TOKEN')).toBe(false);
  });

  it('returns a frozen object', () => {
    expect(
      Object.isFrozen(loadLiveSecrets({secretsPath: SAMPLE_SECRETS_PATH})),
    ).toBe(true);
  });

  it('returns an empty object for a missing file', () => {
    const missingRoot = mkdtempSync(path.join(tmpdir(), 'live-secrets-'));
    try {
      expect(
        loadLiveSecrets({
          secretsPath: path.join(missingRoot, SECRETS_FILE_NAME),
        }),
      ).toEqual({});
    } finally {
      rmSync(missingRoot, {recursive: true, force: true});
    }
  });

  it('throws a parse error that holds no secret value', () => {
    vi.mocked(parseEnv).mockImplementationOnce(content => {
      throw new SyntaxError(`Cannot parse the env text: ${content}`);
    });
    const thrownError = catchError(() =>
      loadLiveSecrets({secretsPath: SAMPLE_SECRETS_PATH}),
    );
    expect(thrownError).toBeInstanceOf(Error);
    const errorText = `${toErrorText(thrownError)} ${thrownError.stack} ${inspect(thrownError, {depth: 10})}`;
    for (const fixtureValue of FIXTURE_VALUES) {
      expect(errorText.includes(fixtureValue)).toBe(false);
    }
  });

  it('writes nothing to the console', () => {
    const consoleSpies = ['log', 'info', 'warn', 'error', 'debug'].map(
      methodName => vi.spyOn(console, methodName).mockImplementation(() => {}),
    );
    loadLiveSecrets({secretsPath: SAMPLE_SECRETS_PATH});
    for (const consoleSpy of consoleSpies) {
      expect(consoleSpy).not.toHaveBeenCalled();
    }
  });
});

describe('getLiveSecretsPath', () => {
  it('resolves to the main checkout file from a worktree', () => {
    expect(getLiveSecretsPath()).toBe(
      path.join(findMainCheckoutPath(), SECRETS_FILE_NAME),
    );
  });
});
