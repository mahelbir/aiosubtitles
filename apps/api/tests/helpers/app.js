import {buildApp} from '../../src/build.js';
import {config} from '../../src/config/index.js';
import {basePathField} from '../../src/config/schema.js';
import {SECURITY_KEY_HEADER} from '../../src/plugins/security-key.js';
import {socket} from '../../src/sockets/index.js';
import {
  FAULTY_SOCKET_FIXTURE_KEY,
  SECURITY_KEY_FIXTURE_URL,
  SOCKET_FIXTURE_KEY,
  THROTTLED_SOCKET_FIXTURE_KEY,
  faultySocketFixture,
  httpFixture,
  paginationFixture,
  securityKeyFixture,
  settingsFixture,
  socketFixture,
  throttledSocketFixture,
} from './fixtures.js';

let instance = null;
let scope = null;
let basePath = config.apiBasePath;
const routes = [];

export function setTestAppBasePath(path) {
  if (instance) {
    throw new Error('The test app is already built');
  }
  basePath = basePathField.parse(path);
}

export function getTestAppBasePath() {
  return basePath;
}

export async function getTestApp() {
  if (!instance) {
    socket[SOCKET_FIXTURE_KEY] = socketFixture;
    socket[THROTTLED_SOCKET_FIXTURE_KEY] = throttledSocketFixture;
    socket[FAULTY_SOCKET_FIXTURE_KEY] = faultySocketFixture;
    instance = buildApp({
      logger: false,
      basePath,
      extraPlugins: [
        securityKeyFixture,
        settingsFixture,
        httpFixture,
        paginationFixture,
      ],
    });
    /* Registration is deferred until ready(), so a hook added here still sees
       every route the autoloader is about to declare. */
    instance.addHook('onRoute', route => {
      routes.push(route);
    });
    /* `app.js` is not a `fp` plugin, so every decorator its plugins add lives in
       its context rather than on the root instance. A request is the reliable
       way back to that context: the route's own scope inherits from it. */
    instance.addHook('onRequest', async request => {
      scope ??= request.server;
    });
    await instance.ready();
    await instance.inject({
      method: 'GET',
      url: basePath + SECURITY_KEY_FIXTURE_URL,
      headers: {[SECURITY_KEY_HEADER]: config.securityKey},
    });
  }
  return instance;
}

export function getScopeWith(name) {
  if (typeof scope?.[name] !== 'function') {
    throw new Error(`No application scope decorates "${name}"`);
  }
  return scope;
}

export function getRegisteredRoutes() {
  return routes.filter(route => route.method !== 'HEAD');
}

export async function closeTestApp() {
  if (!instance) {
    return;
  }
  const app = instance;
  instance = null;
  scope = null;
  basePath = config.apiBasePath;
  routes.length = 0;
  await app.close();
}
