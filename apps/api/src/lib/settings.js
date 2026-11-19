import {AsyncLocalStorage} from 'node:async_hooks';
import * as path from 'node:path';
import {FileSettingsStore, Settings} from '@mahelbir/settings';
import {getConflictingPaths} from '@repo/shared/lib/settings.js';
import {settingsDefinition} from '@repo/shared/schemas/setting.js';
import {config} from '../config/index.js';
import {createLogger} from './logger.js';

const logger = createLogger('settings');

const expectedValues = new AsyncLocalStorage();

export const SETTINGS_FILE = path.join(
  config.privateStoragePath,
  'settings.json',
);

export class SettingsConflictError extends Error {
  paths;
  settings;

  constructor(paths, settings) {
    super('Settings moved away from the values a write was based on');
    this.name = 'SettingsConflictError';
    this.paths = paths;
    this.settings = settings;
  }
}

export class LoggedSettings extends Settings {
  _failure = null;
  _log;

  /**
   * @param {import('@mahelbir/settings').SettingsOptions & Object} options
   * @param {Pick<import('pino').Logger, 'error'>} [options.log]
   */
  constructor({log = logger, store, schema, ...options}) {
    super({
      ...options,
      store: withExpectedValues(store, schema),
      schema,
      onError: error => this._reportFailure(error),
    });
    this._log = log;
  }

  patchIfUnchanged(params, expected) {
    return expectedValues.run(expected, () => this.patch(params));
  }

  async reload() {
    await super.reload();
    this._failure = null;
  }

  _reportFailure(error) {
    const failure = String(error);
    if (failure !== this._failure) {
      this._failure = failure;
      this._log.error(
        {
          err: {type: error.name, message: error.message, stack: error.stack},
          causeType: error.cause?.name,
        },
        'Settings error',
      );
    }
  }
}

function withExpectedValues(store, schema) {
  return {
    read: () => store.read(),
    update: updater => {
      const expected = expectedValues.getStore();
      return store.update(async current => {
        if (expected) {
          await assertUnchanged(expected, current, schema);
        }
        return updater(current);
      });
    },
  };
}

async function assertUnchanged(expected, current, schema) {
  const result = schema
    ? await schema['~standard'].validate(current ?? {})
    : {value: current ?? {}};
  if (result.issues) {
    return;
  }
  const paths = getConflictingPaths(expected, result.value);
  if (paths.length > 0) {
    throw new SettingsConflictError(paths, result.value);
  }
}

export function createSettings(filePath, schema) {
  return new LoggedSettings({store: new FileSettingsStore(filePath), schema});
}

export const settings = createSettings(
  SETTINGS_FILE,
  settingsDefinition.schema,
);
