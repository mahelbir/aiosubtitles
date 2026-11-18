import {defineConfig} from 'vitest/config';
import {server} from './vitest.config.js';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'api-live',
          root: './apps/api',
          include: ['tests/live/**/*.live.test.js'],
          globalSetup: ['./tests/setup/containers.js'],
          setupFiles: ['./tests/setup/database.js'],
          pool: 'forks',
          fileParallelism: false,
          testTimeout: 60000,
          hookTimeout: 180000,
          server,
        },
      },
    ],
  },
});
