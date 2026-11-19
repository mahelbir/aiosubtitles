import * as path from 'node:path';
import {FileSettingsStore, Settings} from '@mahelbir/settings';
import {settingsDefinition} from '@repo/shared/schemas/setting.js';
import {config} from '../config/index.js';
import {createLogger} from './logger.js';

const logger = createLogger('settings');

export const SETTINGS_FILE = path.join(
  config.privateStoragePath,
  'settings.json',
);

export class LoggedSettings extends Settings {
  _failure = null;
  _log;
  _filePath;

  /**
   * @param {import('@mahelbir/settings').SettingsOptions & Object} options
   * @param {Pick<import('pino').Logger, 'error'>} [options.log]
   * @param {string|null} [options.filePath]
   */
  constructor({log = logger, filePath = null, ...options}) {
    super({...options, onError: error => this._reportFailure(error)});
    this._log = log;
    this._filePath = filePath;
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
          errorName: error?.name,
          causeName: error?.cause?.name,
          settingsFile: this._filePath,
        },
        'Settings error',
      );
    }
  }
}

export function createSettings(filePath, schema) {
  return new LoggedSettings({
    store: new FileSettingsStore(filePath),
    schema,
    filePath,
  });
}

export const settings = createSettings(
  SETTINGS_FILE,
  settingsDefinition.schema,
);
