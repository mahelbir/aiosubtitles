import {config} from '../../config/index.js';
import {
  IDENTIFIER_COLLATION,
  LOCALE_COLLATION,
  collateColumn,
} from '../collation.js';

const DEFAULT_COLLATION = 'default';

const COLUMNS = [
  {table: 'users', column: 'email', collation: IDENTIFIER_COLLATION},
  {table: 'users', column: 'password', collation: IDENTIFIER_COLLATION},
  {table: 'roles', column: 'slug', collation: IDENTIFIER_COLLATION},
  {table: 'roles', column: 'label', collation: LOCALE_COLLATION},
  {
    table: 'role_permissions',
    column: 'permission',
    collation: IDENTIFIER_COLLATION,
  },
];

export const up = async ({context: queryInterface}) => {
  await queryInterface.sequelize.transaction(async transaction => {
    // PostgreSQL-specific
    await queryInterface.sequelize.query(
      `CREATE COLLATION ${queryInterface.quoteIdentifier(LOCALE_COLLATION)}` +
        ` (provider = icu, locale = ${queryInterface.sequelize.escape(config.locale)})`,
      {transaction},
    );
    for (const entry of COLUMNS) {
      await collateColumn({...entry, transaction}, queryInterface);
    }
  });
};

export const down = async ({context: queryInterface}) => {
  await queryInterface.sequelize.transaction(async transaction => {
    for (const entry of COLUMNS) {
      await collateColumn(
        {...entry, collation: DEFAULT_COLLATION, transaction},
        queryInterface,
      );
    }
    // PostgreSQL-specific
    await queryInterface.sequelize.query(
      `DROP COLLATION ${queryInterface.quoteIdentifier(LOCALE_COLLATION)}`,
      {transaction},
    );
  });
};
