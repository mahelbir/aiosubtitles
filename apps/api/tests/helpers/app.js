import {buildApp} from '../../src/build.js';
import {config} from '../../src/config/index.js';
import {basePathField} from '../../src/config/schema.js';
import {HTTP_FIXTURE_URL, httpFixture} from './fixtures.js';

let instance = null;
let scope = null;
let basePath = config.apiBasePath;
let testPlugins = [];
let testAppOptions = {};
const routes = [];

function assertNotBuilt() {
  if (instance) {
    throw new Error('The test app is already built');
  }
}

export function setTestAppBasePath(path) {
  assertNotBuilt();
  basePath = basePathField.parse(path);
}

export function setTestAppPlugins(plugins) {
  assertNotBuilt();
  testPlugins = plugins;
}

export function setTestAppOptions(options) {
  assertNotBuilt();
  testAppOptions = options;
}

export function getTestAppBasePath() {
  return basePath;
}

export async function getTestApp() {
  if (!instance) {
    instance = buildApp({
      ...testAppOptions,
      logger: false,
      basePath,
      extraPlugins: [httpFixture, ...testPlugins],
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
    await instance.inject({method: 'GET', url: basePath + HTTP_FIXTURE_URL});
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
  testPlugins = [];
  testAppOptions = {};
  routes.length = 0;
  await app.close();
}
