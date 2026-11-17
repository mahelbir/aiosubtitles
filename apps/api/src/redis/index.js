import {Redis} from 'ioredis';
import {config} from '../config/index.js';

const options = {
  host: config.redisHost,
  port: config.redisPort,
  db: config.redisDb,
  lazyConnect: true,
  enableAutoPipelining: true,
  connectTimeout: 10000,
  keepAlive: 30000,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  retryStrategy: times => Math.min(times * 200, 5000),
};

if (config.redisUser) {
  options.username = config.redisUser;
}

if (config.redisPass) {
  options.password = config.redisPass;
}

export const redis = new Redis(options);
