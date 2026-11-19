import {Maxios} from '@mepkg/maxios';
import {config} from '../../config/index.js';
import {createGuardedLookup} from './source-address-guard.js';

const TEST_ENVIRONMENT = 'test';

const guardedLookup = createGuardedLookup();

let remoteResourceClient = createRemoteResourceClient();

export function buildRemoteResourceTransport(
  {dispatcher = null, lookup = null} = {},
  environment,
) {
  if (dispatcher === null && lookup === null) {
    return {lookup: guardedLookup};
  }
  if (environment !== TEST_ENVIRONMENT) {
    throw new Error('Only a test may replace the guarded lookup.');
  }
  if (dispatcher !== null && lookup !== null) {
    throw new Error('A dispatcher cannot be combined with a lookup.');
  }
  return dispatcher === null ? {lookup} : {dispatcher};
}

function createRemoteResourceClient(transportOverride) {
  return new Maxios({
    cookies: false,
    ...buildRemoteResourceTransport(transportOverride, config.env),
  });
}

export function getRemoteResourceClient() {
  return remoteResourceClient;
}

export function setRemoteResourceTransport(transportOverride) {
  remoteResourceClient = createRemoteResourceClient(transportOverride);
}
