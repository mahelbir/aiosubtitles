import {afterEach, describe, expect, it} from 'vitest';
import Fastify from 'fastify';
import addonRoutePlugin, {
  createAddonRouteTable,
} from '../../src/plugins/addon-route.js';

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

  it('logs a failed addon route by its error name only', async () => {
    const logLines = [];
    app = Fastify({
      logger: {level: 'trace', stream: {write: line => logLines.push(line)}},
    });
    await app.register(addonRoutePlugin);
    app.get(
      '/__fixtures__/addon',
      {
        config: {
          isAddonRoute: true,
          replyAddonFallback: (request, reply) => reply.send({}),
        },
      },
      async () => {
        throw Object.assign(new Error('The query failed.'), {
          name: 'SequelizeDatabaseError',
          sql: 'SELECT secret-video-id',
        });
      },
    );

    const response = await app.inject('/__fixtures__/addon');

    expect(response.statusCode).toBe(200);
    const errorLines = logLines
      .map(line => JSON.parse(line))
      .filter(({msg}) => msg === 'Addon route failed');
    expect(errorLines).toEqual([
      expect.objectContaining({level: 50, errorName: 'SequelizeDatabaseError'}),
    ]);
    expect(logLines.join('\n')).not.toContain('secret-video-id');
  });

  it('logs an addon request that fails its schema at debug level', async () => {
    const logLines = [];
    app = Fastify({
      logger: {level: 'trace', stream: {write: line => logLines.push(line)}},
    });
    await app.register(addonRoutePlugin);
    app.get(
      '/__fixtures__/addon',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: {count: {type: 'integer'}},
          },
        },
        config: {
          isAddonRoute: true,
          replyAddonFallback: (request, reply) => reply.send({}),
        },
      },
      async () => ({}),
    );

    const response = await app.inject('/__fixtures__/addon?count=many');

    expect(response.statusCode).toBe(200);
    expect(
      logLines
        .map(line => JSON.parse(line))
        .filter(({msg}) => msg === 'Addon route failed')
        .map(({level}) => level),
    ).toEqual([20]);
  });
});

describe('the addon route table', () => {
  function makeReply() {
    const sent = {statusCode: null, body: null};
    const reply = {
      code(statusCode) {
        sent.statusCode = statusCode;
        return reply;
      },
      type() {
        return reply;
      },
      header() {
        return reply;
      },
      send(body) {
        sent.body = JSON.parse(body);
        return reply;
      },
    };
    return {reply, sent};
  }

  it('answers an error it does not place with its own status name', () => {
    const {reply, sent} = makeReply();

    createAddonRouteTable().replyFrameworkError(
      Object.assign(new Error('Unexpected error from async constraint'), {
        code: 'FST_ERR_ASYNC_CONSTRAINT',
        statusCode: 500,
      }),
      {raw: {url: '/anything'}},
      reply,
    );

    expect(sent).toEqual({
      statusCode: 500,
      body: {
        error: 'Internal Server Error',
        code: 'FST_ERR_ASYNC_CONSTRAINT',
        message: 'Unexpected error from async constraint',
        statusCode: 500,
      },
    });
  });
});
