import {getApiUrl} from './api.js';

export async function holdRequest(page, url, {method} = {}) {
  const held = Promise.withResolvers();
  const released = Promise.withResolvers();
  await page.route(url, async route => {
    if (method && route.request().method() !== method) {
      return route.fallback();
    }
    held.resolve(route.request());
    await released.promise;
    return route.fallback();
  });
  return {request: held.promise, release: released.resolve};
}

export function recordRequests(page, isMatch) {
  const requests = [];
  page.on('request', request => {
    if (isMatch(request)) {
      requests.push(request);
    }
  });
  return requests;
}

export function recordApiRequests(page, path) {
  const url = getApiUrl(path);
  return recordRequests(page, request => request.url() === url);
}

export function waitForApiRequest(page, method, path) {
  const url = getApiUrl(path);
  return page.waitForRequest(
    request => request.method() === method && request.url() === url,
  );
}

export async function getAnsweredResponses(requests) {
  const responses = await Promise.all(
    requests.map(request => request.response()),
  );
  return responses.filter(Boolean);
}

export async function getAnsweredStatuses(requests) {
  const responses = await getAnsweredResponses(requests);
  return responses.map(response => response.status());
}
