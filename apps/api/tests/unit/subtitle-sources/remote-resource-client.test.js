import {afterEach, describe, expect, it} from 'vitest';
import {
  buildRemoteResourceTransport,
  getRemoteResourceClient,
  setRemoteResourceTransport,
} from '../../../src/lib/subtitle-sources/remote-resource-client.js';
import {
  installNetworkDispatcher,
  networkDispatcher,
} from '../../helpers/network.js';

const PRIVATE_ADDRESS = '10.0.0.5';

function lookupAddress(lookup, hostname) {
  return new Promise(resolve => {
    lookup(hostname, {}, (error, address) => resolve({error, address}));
  });
}

afterEach(() => {
  installNetworkDispatcher();
});

describe('buildRemoteResourceTransport', () => {
  it.each(['production', 'development', 'test'])(
    'resolves every host through the guarded lookup by default under %s',
    async environment => {
      const transport = buildRemoteResourceTransport({}, environment);

      expect(transport).toEqual({lookup: expect.any(Function)});
      const {error} = await lookupAddress(transport.lookup, PRIVATE_ADDRESS);
      expect(error?.code).toBe('ERR_PRIVATE_HOST');
    },
  );

  it('hands every client the one lookup function so the keep-alive pool is shared', () => {
    expect(buildRemoteResourceTransport({}, 'production').lookup).toBe(
      buildRemoteResourceTransport(undefined, 'production').lookup,
    );
  });

  it.each(['production', 'development'])(
    'refuses a dispatcher in place of the lookup under %s',
    environment => {
      expect(() =>
        buildRemoteResourceTransport(
          {dispatcher: networkDispatcher},
          environment,
        ),
      ).toThrow();
    },
  );

  it.each(['production', 'development'])(
    'refuses a lookup of its own under %s',
    environment => {
      expect(() =>
        buildRemoteResourceTransport({lookup: () => {}}, environment),
      ).toThrow();
    },
  );

  it('refuses a dispatcher and a lookup together, as Maxios does', () => {
    expect(() =>
      buildRemoteResourceTransport(
        {dispatcher: networkDispatcher, lookup: () => {}},
        'test',
      ),
    ).toThrow();
  });

  it('swaps a test dispatcher in for the lookup under test', () => {
    expect(
      buildRemoteResourceTransport({dispatcher: networkDispatcher}, 'test'),
    ).toEqual({dispatcher: networkDispatcher});
  });
});

describe('the shared remote resource client', () => {
  it('sends every request through the test network dispatcher, never a lookup', () => {
    expect(getRemoteResourceClient().config).toMatchObject({
      dispatcher: networkDispatcher,
      lookup: null,
    });
  });

  it('goes back to the guarded lookup once the test transport is cleared', () => {
    setRemoteResourceTransport();

    expect(getRemoteResourceClient().config).toMatchObject({
      dispatcher: null,
      lookup: buildRemoteResourceTransport({}, 'production').lookup,
    });
  });
});
