import {QueryTypes} from 'sequelize';
import {dbUtils} from './utils.js';
import {sequelize} from './index.js';

export const LOCALE_COLLATION = 'app_locale';
export const IDENTIFIER_COLLATION = 'C';

const NON_ASCII_I_PATTERN = /[İı]/g;

export function withCollation(type, collation) {
  return `${sequelize.normalizeDataType(type).toSql()} COLLATE ${dbUtils.quoteIdentifier(collation)}`;
}

export function foldIdentifier(value) {
  return value.replace(NON_ASCII_I_PATTERN, 'i').toLowerCase();
}

export async function collateColumn(
  {table, column, collation, transaction},
  queryInterface,
) {
  const relation = dbUtils.quoteIdentifier(table);
  const [row] = await queryInterface.sequelize.query(
    'SELECT format_type(atttypid, atttypmod) AS type FROM pg_attribute' +
      ' WHERE attrelid = to_regclass(:relation) AND attname = :column AND NOT attisdropped',
    {replacements: {relation, column}, transaction, type: QueryTypes.SELECT},
  );
  if (!row) {
    throw new Error(`No column ${table}.${column} to collate.`);
  }
  await queryInterface.sequelize.query(
    `ALTER TABLE ${relation} ALTER COLUMN ${dbUtils.quoteIdentifier(column)}` +
      ` TYPE ${row.type} COLLATE ${dbUtils.quoteIdentifier(collation)}`,
    {transaction},
  );
}
