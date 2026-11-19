import {omit} from 'es-toolkit';
import pino from 'pino';
import {config} from '../config/index.js';

const DROPPED_ERROR_FIELDS = [
  'sql',
  'parameters',
  'parent',
  'original',
  'errors',
];

function serializeError(error) {
  const serializedError = pino.stdSerializers.err(error);
  if (serializedError === error) {
    return error;
  }
  return omit(
    {
      ...serializedError,
      ...(Array.isArray(error.errors) && {
        aggregateErrors: error.errors.map(serializeError),
      }),
    },
    DROPPED_ERROR_FIELDS,
  );
}

const baseOptions = {
  level: config.logLevel,
  serializers: {err: serializeError},
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
