import {syncBuiltinESMExports} from 'node:module';
import {HttpResponse} from 'msw';
import {afterAll, afterEach, beforeAll} from 'vitest';
import {
  mockNetwork,
  recordBlockedRequest,
  throwIfRequestsBlocked,
} from '../helpers/network.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]', 'localhost']);

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
  syncBuiltinESMExports();
  throwIfRequestsBlocked();
});

function getFrameUrl({protocol, data}) {
  return protocol === 'ws' ? data.connection.client.url.href : data.request.url;
}

function isLoopback(url) {
  return LOOPBACK_HOSTS.has(new URL(url).hostname);
}
