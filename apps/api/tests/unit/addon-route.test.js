import {afterEach, describe, expect, it} from 'vitest';
import Fastify from 'fastify';
import addonRoutePlugin from '../../src/plugins/addon-route.js';

let app = null;

afterEach(async () => {
  await app?.close();
  app = null;
});

async function bootWith(config) {
  app = Fastify({logger: false});
  await app.register(addonRoutePlugin);
  app.register(async fastify => {
    fastify.get('/__fixtures__/addon', {config}, async () => ({}));
  });
  return app.ready();
}

describe('the addon-route plugin', () => {
  it('refuses at boot an addon route that has no fallback', async () => {
    await expect(bootWith({isAddonRoute: true})).rejects.toThrow(
      'An addon route needs a replyAddonFallback.',
    );
  });

  it('boots an addon route that has a fallback', async () => {
    await expect(
      bootWith({
        isAddonRoute: true,
        replyAddonFallback: (request, reply) => reply.send({}),
      }),
    ).resolves.toBeDefined();
  });

  it('leaves a route that is not an addon route alone', async () => {
    await expect(bootWith({})).resolves.toBeDefined();
  });
});
