import {syncBuiltinESMExports} from 'node:module';
import net from 'node:net';
import tls from 'node:tls';
import {HttpResponse} from 'msw';
import {afterAll, afterEach, beforeAll} from 'vitest';
import {
  mockNetwork,
  recordBlockedRequest,
  throwIfRequestsBlocked,
} from '../helpers/network.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]', 'localhost']);
const LOOPBACK_SOCKET_HOSTS = new Set(['localhost', '::1', '[::1]']);
const IPV4_LOOPBACK_PREFIX = '127.';
const SOCKET_PATH_PATTERN = /\D/;
const UNDICI_PACKAGE_PATH = '/node_modules/undici/';
const CONNECT_STACK_DEPTH = 20;
const GUARDED_CONNECTS = [
  {socketModule: net, connectName: 'connect', protocol: 'tcp'},
  {socketModule: net, connectName: 'createConnection', protocol: 'tcp'},
  {socketModule: tls, connectName: 'connect', protocol: 'tls'},
];
const originalConnects = [];

beforeAll(() => {
  /* msw passes an unhandled CONNECT through whatever the strategy below says,
     and the request then rides the tunnel out unseen — a proxy taken from the
     environment is enough. Such a tunnel cannot be stopped from here, so it is
     recorded on sight and the record fails the test. Its URL is the authority. */
  mockNetwork.events.on('request:start', ({request}) => {
    if (request.method === 'CONNECT' && !isLoopback(`http://${request.url}`)) {
      recordBlockedRequest(`CONNECT ${request.url}`);
    }
  });
  mockNetwork.listen({
    /* The guard exists to keep a test away from a real provider. A request to a
       server this suite started itself is not
       that, so loopback passes through and everything else fails the test.
       msw 3 reads only this option, and a predefined strategy would let common
       asset URLs (.json, .xml, …) through, so the callback is ours. Its
       `defaults` only print: throwing is what stops the frame, an HTTP one as
       the network error the predefined strategy raises. The caller only sees a
       failure it may swallow, so the record is what fails the test. */
    onUnhandledFrame({frame, defaults}) {
      const url = getFrameUrl(frame);
      if (isLoopback(url)) {
        return;
      }
      defaults.error();
      recordBlockedRequest(url);
      throw frame.protocol === 'http'
        ? HttpResponse.error()
        : new Error(`Unhandled ${frame.protocol} frame: ${url}`);
    },
  });
  GUARDED_CONNECTS.forEach(({socketModule, connectName, protocol}, index) => {
    originalConnects[index] = socketModule[connectName];
    socketModule[connectName] = guardConnect(originalConnects[index], protocol);
  });
  /* msw patches the CommonJS exports of `node:http` and `node:https`; a named
     ES import keeps the original until those are synced into its bindings. */
  syncBuiltinESMExports();
});

afterEach(() => {
  mockNetwork.resetHandlers();
  throwIfRequestsBlocked();
});

afterAll(() => {
  mockNetwork.close();
  GUARDED_CONNECTS.forEach(({socketModule, connectName}, index) => {
    socketModule[connectName] = originalConnects[index];
  });
  syncBuiltinESMExports();
  throwIfRequestsBlocked();
});

function guardConnect(connect, protocol) {
  return function guardedConnect(...connectArgs) {
    const connectTarget = readConnectTarget(connectArgs);
    if (
      connectTarget === null ||
      isLoopbackHost(connectTarget.host) ||
      !isUndiciPackageConnect()
    ) {
      return connect.apply(this, connectArgs);
    }
    const blockedTarget = `${protocol}://${connectTarget.host}:${connectTarget.port}`;
    recordBlockedRequest(blockedTarget);
    const blockedSocket = new net.Socket();
    process.nextTick(() =>
      blockedSocket.destroy(
        new Error(`Blocked outbound connection: ${blockedTarget}.`),
      ),
    );
    return blockedSocket;
  };
}

function readConnectTarget([connectOptions, connectHost]) {
  if (typeof connectOptions === 'object' && connectOptions !== null) {
    return connectOptions.path
      ? null
      : {host: connectOptions.host ?? 'localhost', port: connectOptions.port};
  }
  if (
    typeof connectOptions === 'string' &&
    SOCKET_PATH_PATTERN.test(connectOptions)
  ) {
    return null;
  }
  return {
    host: typeof connectHost === 'string' ? connectHost : 'localhost',
    port: connectOptions,
  };
}

function isUndiciPackageConnect() {
  const {stackTraceLimit} = Error;
  Error.stackTraceLimit = CONNECT_STACK_DEPTH;
  try {
    return new Error().stack.includes(UNDICI_PACKAGE_PATH);
  } finally {
    Error.stackTraceLimit = stackTraceLimit;
  }
}

function isLoopbackHost(host) {
  return (
    LOOPBACK_SOCKET_HOSTS.has(host) ||
    (net.isIPv4(host) && host.startsWith(IPV4_LOOPBACK_PREFIX))
  );
}

function getFrameUrl({protocol, data}) {
  return protocol === 'ws' ? data.connection.client.url.href : data.request.url;
}

function isLoopback(url) {
  return LOOPBACK_HOSTS.has(new URL(url).hostname);
}
