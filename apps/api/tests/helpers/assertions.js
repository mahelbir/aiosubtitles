import {securityFromHooks} from '../../src/lib/openapi.js';

const ENVELOPE_KEYS = ['success', 'message', 'data'];

export function routeSecurity(route) {
  const declared = route.schema?.security ?? [];
  if (declared.length > 0) {
    return declared;
  }
  const hooks = [route.onRequest, route.preHandler].flat().filter(Boolean);
  return securityFromHooks(hooks);
}

export function routeCalls(route) {
  const methods = (
    Array.isArray(route.method) ? route.method : [route.method]
  ).filter(method => method !== 'HEAD');
  return methods.map(method => ({
    method,
    url: route.url,
    id: `${method} ${route.url}`,
  }));
}

export function readEnvelope(response) {
  const body = response.json();
  const keys = Object.keys(body).sort();
  if (keys.join(',') !== [...ENVELOPE_KEYS].sort().join(',')) {
    throw new Error(
      `Response is not an envelope: got keys [${keys.join(', ')}]`,
    );
  }
  if (typeof body.success !== 'boolean' || typeof body.message !== 'string') {
    throw new Error('Envelope carries the wrong types for success/message');
  }
  return body;
}

export function findForbiddenKeys(value, forbidden, trail = '$') {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      findForbiddenKeys(entry, forbidden, `${trail}[${index}]`),
    );
  }
  if (value === null || typeof value !== 'object') {
    return [];
  }
  return Object.entries(value).flatMap(([key, entry]) => {
    const path = `${trail}.${key}`;
    const hit = forbidden.includes(key) ? [path] : [];
    return [...hit, ...findForbiddenKeys(entry, forbidden, path)];
  });
}
