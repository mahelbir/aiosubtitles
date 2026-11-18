import {setTimeout as delay} from 'node:timers/promises';
import {createLogger} from '../../../lib/logger.js';

const logger = createLogger('subtitle-list');

export function createRequestDeadline(deadlineAt) {
  const readRemainingMs = () => Math.max(Math.ceil(deadlineAt - Date.now()), 0);
  return {
    async raceDeadline(pending, fallback) {
      const timerController = new AbortController();
      try {
        return await Promise.race([
          Promise.resolve(pending).catch(error => {
            logger.warn({errorName: error?.name}, 'A list step failed.');
            return fallback;
          }),
          delay(readRemainingMs(), fallback, {signal: timerController.signal}),
        ]);
      } finally {
        timerController.abort();
      }
    },
    toSignal: () => AbortSignal.timeout(readRemainingMs()),
  };
}
