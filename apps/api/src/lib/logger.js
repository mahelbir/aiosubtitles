import pino from 'pino';
import {config} from '../config/index.js';

const baseOptions = {
  level: config.logLevel,
};

/** @type {import('pino').LoggerOptions} */
export const loggerOptions = config.isDev
  ? {
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname'},
      },
    }
  : baseOptions;

export function createLogger(name, options) {
  return pino({...loggerOptions, ...options, name});
}
