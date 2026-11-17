import fp from 'fastify-plugin';
import {config} from '../config/index.js';
import registry from '../workers/index.js';

export default fp(
  async function workersPlugin(fastify) {
    if (config.env === 'test') {
      return;
    }

    const runners = [];

    fastify.decorate('startRunner', runner => {
      runner
        .executeJobs()
        .catch(err =>
          fastify.log.error(err, `Worker "${runner.name}" crashed`),
        );
      runners.push(runner);
      return runner;
    });

    const ordered = [...registry].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    );

    fastify.addHook('onReady', async () => {
      for (const {worker, args} of ordered) {
        await worker(fastify, args);
      }
      fastify.log.info(
        {
          runners: runners.map(runner => runner.constructor.name),
        },
        `Workers started`,
      );
    });

    fastify.addHook('preClose', async () => {
      for (const runner of runners) {
        for (const id of Object.keys(runner.runningJobs)) {
          runner.disableJob(id);
        }
      }
    });
  },
  {name: 'workers'},
);
