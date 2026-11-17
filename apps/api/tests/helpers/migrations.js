import {asyncNoop, mapKeys, mapValues, noop} from 'es-toolkit';
import {Utils} from 'sequelize';
import {createMigrator} from '../../src/db/cli/umzug.js';
import {sequelize} from '../../src/db/index.js';
import {uuidV7} from '../../src/lib/common.js';

export const silentLogger = Object.freeze({
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
});

const JSON_COLUMN_TYPES = new Set(['JSON', 'JSONB']);

export async function withMigrationRolledBack(nameFragment, assertions) {
  const migrator = createMigrator(silentLogger);
  const executed = await migrator.executed();
  const index = executed.findIndex(entry => entry.name.includes(nameFragment));
  if (index === -1) {
    throw new Error(`No executed migration matches "${nameFragment}".`);
  }
  const step = executed.length - index;
  try {
    await migrator.down({step});
    await assertions(migrator, step);
  } finally {
    await migrator.up();
  }
}

export function roundTripMigration(nameFragment) {
  return withMigrationRolledBack(nameFragment, asyncNoop);
}

export async function insertLegacyRow(tableName, values) {
  const queryInterface = sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable(tableName);
  const row = mapKeys(values, (_value, key) => Utils.underscore(key));
  const id = 'id' in columns ? (row.id ?? uuidV7()) : undefined;
  await queryInterface.bulkInsert(tableName, [
    mapValues({...row, ...(id && {id})}, (value, column) =>
      JSON_COLUMN_TYPES.has(columns[column]?.type)
        ? JSON.stringify(value)
        : value,
    ),
  ]);
  return id;
}
