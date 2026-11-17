import {BackgroundJob, BackgroundJobRunner} from 'background-job';
import {randomInteger} from 'melperjs';
import {MonitorLevel} from '@repo/shared/constants/monitor.js';
import {socket} from '../sockets/index.js';

export default async function (fastify, [label]) {
  class HeartbeatJob extends BackgroundJob {
    async execute() {
      this.ticks += 1;
      const cooldown = this.ticks % 2 === 0 ? {cooldown: true} : null;
      const levels = MonitorLevel.values.filter(
        level => level !== MonitorLevel.DEBUG,
      );
      const level =
        levels[(randomInteger(0, levels.length) + this.id) % levels.length];
      this.log(`Tick: ${this.ticks} | ${level}`, level, cooldown);
      if (cooldown) {
        this.disable(5000);
      }
    }

    log(message, level = MonitorLevel.INFO, data = null) {
      fastify.log.info(
        {worker: this.name, label, tick: this.ticks},
        'Heartbeat',
      );
      socket.monitor.line('heartbeat', {
        id: this.id,
        title: `Heartbeat #${this.id}`,
        message,
        level,
        data,
      });
    }

    init(params = null) {
      this.ticks = 0;
    }

    destroy() {
      fastify.log.info({worker: this.name}, 'Heartbeat stopped');
    }
  }

  class HeartbeatRunner extends BackgroundJobRunner {
    constructor() {
      super('heartbeat');
    }

    async getExecutableJobs() {
      return [
        {
          id: 1,
          jobClass: HeartbeatJob,
          initParams: null,
          delayMs: 30000,
        },
        {
          id: 2,
          jobClass: HeartbeatJob,
          initParams: null,
          delayMs: 30000,
        },
      ];
    }
  }

  const runner = new HeartbeatRunner();

  fastify.startRunner(runner);
}
