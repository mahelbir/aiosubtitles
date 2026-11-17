import {describe, expect, it} from 'vitest';
import {QueryTypes} from 'sequelize';
import {
  IDENTIFIER_COLLATION,
  LOCALE_COLLATION,
} from '../../src/db/collation.js';
import {sequelize} from '../../src/db/index.js';
import {getAppModels} from '../helpers/models.js';

const query = (sql, replacements) =>
  sequelize.query(sql, {replacements, type: QueryTypes.SELECT});

describe('database schema', () => {
  it('declares every column the models name', async () => {
    const models = getAppModels();
    const rows = await query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name IN (:tables)`,
      {tables: models.map(model => model.tableName)},
    );
    const present = new Set(
      rows.map(row => `${row.table_name}.${row.column_name}`),
    );

    const missing = [];
    for (const model of models) {
      for (const attribute of Object.values(model.getAttributes())) {
        const key = `${model.tableName}.${attribute.field}`;
        if (!present.has(key)) {
          missing.push(key);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('collates every collatable column as language text or as an identifier', async () => {
    const rows = await query(
      `SELECT t.relname AS table_name, a.attname AS column_name,
              c.collname AS collation_name
         FROM pg_attribute a
         JOIN pg_class t ON t.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         JOIN pg_collation c ON c.oid = a.attcollation
        WHERE n.nspname = 'public' AND t.relname IN (:tables)
          AND a.attnum > 0 AND NOT a.attisdropped`,
      {tables: getAppModels().map(model => model.tableName)},
    );
    const named = new Set([LOCALE_COLLATION, IDENTIFIER_COLLATION]);

    expect(
      rows
        .filter(row => !named.has(row.collation_name))
        .map(row => `${row.table_name}.${row.column_name}`),
    ).toEqual([]);
  });

  it('keeps the column widths the shared constants promise', async () => {
    const models = getAppModels();
    const rows = await query(
      `SELECT table_name, column_name, character_maximum_length
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name IN (:tables)
          AND character_maximum_length IS NOT NULL`,
      {tables: models.map(model => model.tableName)},
    );
    const widths = new Map(
      rows.map(row => [
        `${row.table_name}.${row.column_name}`,
        row.character_maximum_length,
      ]),
    );

    const drift = [];
    for (const model of models) {
      for (const attribute of Object.values(model.getAttributes())) {
        const declared = attribute.type?.options?.length;
        if (typeof declared !== 'number') {
          continue;
        }
        const key = `${model.tableName}.${attribute.field}`;
        if (widths.get(key) !== declared) {
          drift.push(`${key}: model ${declared}, database ${widths.get(key)}`);
        }
      }
    }
    expect(drift).toEqual([]);
  });
});
