import Fastify, {LogController} from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from '@fastify/type-provider-zod';
import {URL_MAX_LENGTH} from '@repo/shared/constants/common.js';
import {config} from './config/index.js';
import {basePathField} from './config/schema.js';
import {loggerOptions} from './lib/logger.js';
import app from './app.js';

/**
 * @param {import('fastify').FastifyServerOptions & Object} [options]
 * @param {string} [options.basePath]
 * @param {import('fastify').FastifyPluginAsync[]} [options.extraPlugins]
 * @returns {import('fastify').FastifyInstance}
 */
export function buildApp({
  basePath = config.apiBasePath,
  extraPlugins = [],
  ...options
} = {}) {
  const fastify = Fastify({
    routerOptions: {
      ignoreTrailingSlash: true,
      maxParamLength: URL_MAX_LENGTH,
    },
    logger: loggerOptions,
    logController: new LogController({disableRequestLogging: true}),
    trustProxy: config.trustProxy,
    requestTimeout: config.requestTimeout,
    keepAliveTimeout: 90000,
    pluginTimeout: 15000,
    ...options,
  });

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  fastify.register(app, {
    basePath: basePathField.parse(basePath),
    extraPlugins,
  });

  return fastify;
}
