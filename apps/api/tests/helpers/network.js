import {setupServer} from 'msw/node';
import {MockAgent} from 'undici';
import {setRemoteResourceTransport} from '../../src/lib/subtitle-sources/remote-resource-client.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]', 'localhost']);
const MOCK_NOT_MATCHED_CODE = 'UND_MOCK_ERR_MOCK_NOT_MATCHED';

export const mockNetwork = setupServer();

const blockedRequests = [];

export function recordBlockedRequest(url) {
  blockedRequests.push(url);
}

export function takeBlockedRequests() {
  return blockedRequests.splice(0);
}

export function throwIfRequestsBlocked() {
  const blocked = takeBlockedRequests();
  if (blocked.length > 0) {
    throw new Error(`Unmocked outbound requests: ${blocked.join(', ')}.`);
  }
}

export function isLoopback(url) {
  return LOOPBACK_HOSTS.has(new URL(url).hostname);
}

class BlockRecordingHandler {
  constructor(handler, requestUrl) {
    this._handler = handler;
    this._requestUrl = requestUrl;
  }

  onRequestStart(...handlerArgs) {
    return this._handler.onRequestStart?.(...handlerArgs);
  }

  onRequestUpgrade(...handlerArgs) {
    return this._handler.onRequestUpgrade?.(...handlerArgs);
  }

  onResponseStart(...handlerArgs) {
    return this._handler.onResponseStart?.(...handlerArgs);
  }

  onResponseData(...handlerArgs) {
    return this._handler.onResponseData?.(...handlerArgs);
  }

  onResponseEnd(...handlerArgs) {
    return this._handler.onResponseEnd?.(...handlerArgs);
  }

  onResponseError(controller, error) {
    if (error?.code === MOCK_NOT_MATCHED_CODE) {
      recordBlockedRequest(this._requestUrl);
    }
    return this._handler.onResponseError?.(controller, error);
  }
}

class BlockRecordingMockAgent extends MockAgent {
  dispatch(dispatchOptions, handler) {
    return super.dispatch(
      dispatchOptions,
      new BlockRecordingHandler(
        handler,
        `${dispatchOptions.origin}${dispatchOptions.path}`,
      ),
    );
  }
}

export const networkDispatcher = new BlockRecordingMockAgent();
networkDispatcher.disableNetConnect();
networkDispatcher.enableNetConnect(host => isLoopback(`http://${host}`));

export function installNetworkDispatcher() {
  setRemoteResourceTransport({dispatcher: networkDispatcher});
}
