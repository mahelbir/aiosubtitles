import fp from 'fastify-plugin';
import {startShutdownDeadline} from '../lib/shutdown-deadline.js';
import {
  drainBackgroundQueues,
  stopBackgroundWork,
} from '../lib/subtitle-background/background-queues.js';

export default fp(
  async function backgroundWorkPlugin(fastify) {
    fastify.addHook('preClose', async () => {
      stopBackgroundWork({signal: startShutdownDeadline()});
    });

    fastify.addHook('onClose', async () => {
      await drainBackgroundQueues({signal: startShutdownDeadline()});
    });
  },
  {name: 'background-work', dependencies: ['db', 'redis']},
);
