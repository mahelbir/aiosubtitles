import {Sequelize} from 'sequelize';
import {config} from '../config/index.js';

const pool = {
  min: config.dbPoolMin,
  max: config.dbPoolMax,
  acquire: config.dbPoolAcquire,
  idle: 30000,
  evict: 30000,
};

const options = {
  dialect: 'postgres',
  host: config.dbHost,
  port: config.dbPort,
  logging: false,
  define: {
    underscored: true,
    timestamps: false,
    whereMergeStrategy: 'and',
  },
  pool,
  dialectOptions: {
    connectionTimeoutMillis: 10000,
    statement_timeout: 180000,
    idle_in_transaction_session_timeout: 180000,
    application_name: `api${config.port}`,
  },
  retry: {
    max: 3,
    match: [/deadlock/i, /canceling statement due to .*timeout/i],
  },
  isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  timezone: '+00:00',
};

export const sequelize = new Sequelize(
  config.dbName,
  config.dbUser,
  config.dbPass,
  options,
);
