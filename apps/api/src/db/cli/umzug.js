import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {SequelizeStorage, Umzug} from 'umzug';
import {config} from '../../config/index.js';
import {sequelize} from '../index.js';

const dbDir = path.join(config.srcPath, 'db');

const getOptions = namespace => ({
  migrations: {
    glob: [`${namespace}s/*.js`, {cwd: dbDir}],
    resolve: ({name, path: filepath, context}) => ({
      name: `${namespace}:${name}`,
      up: async () =>
        (await import(pathToFileURL(filepath).href)).up({context}),
      down: async () =>
        (await import(pathToFileURL(filepath).href)).down({context}),
    }),
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({sequelize}),
});

const toUmzugLogger = log => ({
  info: ({message, ...rest}) => log.info(rest, message),
  warn: ({message, ...rest}) => log.warn(rest, message),
  error: ({message, ...rest}) => log.error(rest, message),
  debug: ({message, ...rest}) => log.debug(rest, message),
});

export function createMigrator(log = console) {
  return new Umzug({
    ...getOptions('migration'),
    logger: toUmzugLogger(log),
  });
}

export function createSeeder(log = console) {
  return new Umzug({
    ...getOptions('seeder'),
    logger: toUmzugLogger(log),
  });
}

export function runCli(umzug) {
  return umzug.getCli().executeWithoutErrorHandling();
}
