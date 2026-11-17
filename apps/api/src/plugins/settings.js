import fp from 'fastify-plugin';
import {settingsDefinition} from '@repo/shared/schemas/setting.js';
import {settings} from '../lib/settings.js';

export default fp(
  async function settingsPlugin(fastify) {
    settings.startPolling(1);
    fastify.decorate('settings', settings);
    fastify.decorate('settingsDefinition', settingsDefinition);

    fastify.addHook('onClose', async () => {
      settings.stopPolling();
    });
  },
  {name: 'settings'},
);
