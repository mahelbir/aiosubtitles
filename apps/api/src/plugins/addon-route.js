import {escapeRegExp} from 'es-toolkit';
import fp from 'fastify-plugin';
import {StatusCodes, getReasonPhrase} from 'http-status-codes';

const ROUTE_PARAM_PATTERN = /(:\w+)/;
const ADDON_ORIGIN = '*';
const USER_CONFIG_SEGMENT = ':userConfigId';
const QUERY_SEPARATOR = '?';
const PATH_SEPARATOR = '/';
const URL_FRAMEWORK_ERROR_CODES = new Set([
  'FST_ERR_BAD_URL',
  'FST_ERR_MAX_PARAM_LENGTH',
]);

export function createAddonRouteTable() {
  const addonRoutes = [];
  return {
    addAddonRoute({url, replyAddonFallback}) {
      addonRoutes.push({urlPattern: toUrlPattern(url), replyAddonFallback});
    },
    replyFrameworkError(error, request, reply) {
      const [rawPath] = request.raw.url.split('?');
      const addonRoute = addonRoutes.find(({urlPattern}) =>
        urlPattern.test(rawPath),
      );
      if (!addonRoute) {
        return reply
          .code(error.statusCode)
          .type('application/json')
          .send(
            JSON.stringify({
              error: readFrameworkErrorName(error),
              code: error.code,
              message: error.message,
              statusCode: error.statusCode,
            }),
          );
      }
      request.log.warn({code: error.code}, 'Addon route got a malformed url.');
      reply
        .code(StatusCodes.OK)
        .header('access-control-allow-origin', ADDON_ORIGIN);
      return addonRoute.replyAddonFallback(request, reply);
    },
  };
}

export default fp(
  async function addonRoutePlugin(fastify, {addonRouteTable}) {
    fastify.addHook('onRoute', route => {
      const {isAddonRoute, replyAddonFallback} = route.config ?? {};
      if (!isAddonRoute) {
        return;
      }
      if (!replyAddonFallback) {
        throw new Error('An addon route needs a replyAddonFallback.');
      }
      addonRouteTable?.addAddonRoute({url: route.url, replyAddonFallback});
      route.logSerializers = {
        ...route.logSerializers,
        req: serializeAddonRequest,
      };
      route.errorHandler = (err, request, reply) => {
        const logLevel = err.validation ? 'debug' : 'error';
        request.log[logLevel](
          {url: request.routeOptions.url, errorName: err.name, code: err.code},
          'Addon route failed',
        );
        return replyAddonFallback(request, reply.code(StatusCodes.OK));
      };
    });
  },
  {name: 'addon-route'},
);

export function serializeAddonRequest(request) {
  return {
    method: request.method,
    url: request.routeOptions.url,
    ...(request.log?.isLevelEnabled?.('debug')
      ? {path: toPlaceholderPath(request)}
      : {}),
    version: request.headers?.['accept-version'],
    host: request.host,
    remoteAddress: request.clientIp,
    remotePort: request.socket?.remotePort,
  };
}

function toPlaceholderPath(request) {
  const [rawPath] = request.url.split(QUERY_SEPARATOR);
  const routeSegments = request.routeOptions.url.split(PATH_SEPARATOR);
  return rawPath
    .split(PATH_SEPARATOR)
    .map((pathSegment, segmentIndex) =>
      routeSegments[segmentIndex] === USER_CONFIG_SEGMENT
        ? USER_CONFIG_SEGMENT
        : pathSegment,
    )
    .join(PATH_SEPARATOR);
}

function readFrameworkErrorName({code, statusCode}) {
  return getReasonPhrase(
    URL_FRAMEWORK_ERROR_CODES.has(code) ? StatusCodes.BAD_REQUEST : statusCode,
  );
}

function toUrlPattern(url) {
  const patternSource = url
    .split(ROUTE_PARAM_PATTERN)
    .map(urlPart =>
      ROUTE_PARAM_PATTERN.test(urlPart) ? '[^/]+?' : escapeRegExp(urlPart),
    )
    .join('');
  return new RegExp(`^${patternSource}/?$`);
}
