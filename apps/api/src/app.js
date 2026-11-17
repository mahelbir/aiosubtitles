import path from 'node:path';
import AutoLoad from '@fastify/autoload';
import {config} from './config/index.js';

const PRIVATE_PATTERN = /(^|\/)_/;
const DEV_ONLY_PATTERN = /\.dev\.[cm]?js$/;

const isProduction = config.env === 'production';

const pluginIgnorePattern = isProduction ? DEV_ONLY_PATTERN : undefined;

const routeIgnorePattern = isProduction
  ? new RegExp(`${PRIVATE_PATTERN.source}|${DEV_ONLY_PATTERN.source}`)
  : PRIVATE_PATTERN;

export default async function app(fastify, opts) {
  const {
    basePath = config.apiBasePath,
    extraPlugins = [],
    ...autoloadOptions
  } = opts;

  await fastify.register(AutoLoad, {
    dir: path.join(config.srcPath, 'plugins'),
    ignorePattern: pluginIgnorePattern,
    options: {...autoloadOptions, basePath},
  });

  await fastify.register(AutoLoad, {
    dir: path.join(config.srcPath, 'routes'),
    autoHooks: true,
    cascadeHooks: true,
    dirNameRoutePrefix(_parent, folder) {
      if (/^\(.+\)$/.test(folder)) {
        return false;
      }
      const param = folder.match(/^\[(.+)\]$/);
      if (param) {
        return `:${param[1]}`;
      }
      return folder;
    },
    ignorePattern: routeIgnorePattern,
    options: {...autoloadOptions, prefix: basePath},
  });

  await Promise.all(
    extraPlugins.map(plugin => fastify.register(plugin, {prefix: basePath})),
  );
}
