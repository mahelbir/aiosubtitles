import {config} from '../../config/index.js';
import {LOCALE_COLLATION} from '../collation.js';

export const up = async ({context: queryInterface}) => {
  await queryInterface.sequelize.query(
    `CREATE COLLATION ${queryInterface.quoteIdentifier(LOCALE_COLLATION)}` +
      ` (provider = icu, locale = ${queryInterface.sequelize.escape(config.locale)})`,
  );
};

export const down = async ({context: queryInterface}) => {
  await queryInterface.sequelize.query(
    `DROP COLLATION ${queryInterface.quoteIdentifier(LOCALE_COLLATION)}`,
  );
};
