import {setupServer} from 'msw/node';

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
