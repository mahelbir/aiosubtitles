import {BackgroundJob, BackgroundJobRunner} from 'background-job';
import {readBackgroundQueueSizes} from '../lib/subtitle-background/background-queues.js';

const QUEUE_REPORT_DELAY_MS = 60000;

export default async function (fastify) {
  class SubtitleBackgroundWorkJob extends BackgroundJob {
    async execute() {
      fastify.log.debug(
        {backgroundQueues: readBackgroundQueueSizes()},
        'Subtitle background queues',
      );
    }
  }

  class SubtitleBackgroundWorkRunner extends BackgroundJobRunner {
    constructor() {
      super('subtitle-background-work');
    }

    async getExecutableJobs() {
      return [
        {
          id: 1,
          jobClass: SubtitleBackgroundWorkJob,
          initParams: null,
          delayMs: QUEUE_REPORT_DELAY_MS,
        },
      ];
    }
  }

  fastify.startRunner(new SubtitleBackgroundWorkRunner());
}
